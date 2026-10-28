-- ============================================================================
-- Performance Lab — 001 schema
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- Conventions: weights in kg, distances in metres, timestamps in UTC (timestamptz).
-- Missing data is NULL, never 0.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Shared trigger: keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_year int check (birth_year is null or birth_year between 1900 and 2100),
  height_cm numeric check (height_cm is null or height_cm between 50 and 260),
  preferred_weight_unit text not null default 'kg' check (preferred_weight_unit in ('kg','lb')),
  preferred_distance_unit text not null default 'km' check (preferred_distance_unit in ('km','mi')),
  preferred_theme text not null default 'dark' check (preferred_theme in ('dark','light')),
  training_experience text check (training_experience in ('beginner','intermediate','advanced')),
  primary_goal text,
  week_starts_on int not null default 1 check (week_starts_on between 0 and 6),
  default_rest_seconds int not null default 90 check (default_rest_seconds between 5 and 1800),
  weekly_schedule jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create an empty profile when a user signs up. Narrow, reviewed SECURITY DEFINER:
-- it only inserts the caller's own id into profiles.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- exercises
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  normalized_name text generated always as (lower(trim(name))) stored,
  aliases text[] not null default '{}',
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment text[] not null default '{}',
  category text,
  movement_pattern text,
  exercise_type text not null default 'weight_reps'
    check (exercise_type in ('weight_reps','bodyweight_reps','assisted','cardio','isometric','mobility')),
  tracking_config jsonb not null default '{"weight":true,"reps":true}'::jsonb,
  instructions text,
  common_mistakes text,
  demo_url text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- system rows have no owner; custom rows must have one
  constraint exercises_owner_rule check ((is_system and owner_id is null) or (not is_system and owner_id is not null)),
  constraint exercises_tracking_is_object check (jsonb_typeof(tracking_config) = 'object')
);
create trigger trg_exercises_updated before update on public.exercises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- routines
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  folder_name text,
  is_example boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_routines_updated before update on public.routines
  for each row execute function public.set_updated_at();

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position int not null check (position >= 0),
  target_sets int check (target_sets is null or target_sets between 1 and 20),
  target_min_reps int check (target_min_reps is null or target_min_reps >= 0),
  target_max_reps int check (target_max_reps is null or target_max_reps >= 0),
  target_weight_kg numeric check (target_weight_kg is null or target_weight_kg >= 0),
  rest_seconds int check (rest_seconds is null or rest_seconds between 0 and 1800),
  target_rpe numeric check (target_rpe is null or target_rpe between 1 and 10),
  target_rir numeric check (target_rir is null or target_rir between 0 and 10),
  progression_increment_kg numeric check (progression_increment_kg is null or progression_increment_kg > 0),
  group_id uuid,
  group_type text check (group_type is null or group_type in ('superset','circuit')),
  notes text,
  tracking_overrides jsonb,
  unique (routine_id, position) deferrable initially deferred,
  constraint reps_range_ok check (target_min_reps is null or target_max_reps is null or target_min_reps <= target_max_reps)
);

create table if not exists public.routine_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = Sunday
  is_rest_day boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_has_target check (is_rest_day or routine_id is not null)
);
create trigger trg_schedule_updated before update on public.routine_schedule
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ workout data
create table if not exists public.workout_sessions (
  id uuid primary key,                       -- generated on the client => idempotent sync
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  name text not null default 'Workout',
  status text not null default 'in_progress'
    check (status in ('draft','in_progress','paused','completed','discarded')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  session_notes text,
  difficulty_rating int check (difficulty_rating is null or difficulty_rating between 1 and 10),
  energy_rating int check (energy_rating is null or energy_rating between 1 and 5),
  sleep_rating int check (sleep_rating is null or sleep_rating between 1 and 5),
  source_device_id text,
  version int not null default 1,            -- optimistic concurrency
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_sessions_updated before update on public.workout_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.session_exercises (
  id uuid primary key,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name_snapshot text not null,        -- history survives edits/deletes
  position int not null check (position >= 0),
  status text not null default 'active' check (status in ('active','skipped','done')),
  group_id uuid,
  group_type text check (group_type is null or group_type in ('superset','circuit')),
  target_sets int,
  target_min_reps int,
  target_max_reps int,
  rest_seconds int,
  notes text,
  tracking_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_session_ex_updated before update on public.session_exercises
  for each row execute function public.set_updated_at();

create table if not exists public.sets (
  id uuid primary key,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_number int not null check (set_number >= 1),
  set_type text not null default 'normal'
    check (set_type in ('warmup','normal','drop','failure','superset','circuit','rest_pause')),
  weight_kg numeric check (weight_kg is null or weight_kg between 0 and 2000),
  reps int check (reps is null or reps between 0 and 1000),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  distance_meters numeric check (distance_meters is null or distance_meters >= 0),
  assistance_kg numeric check (assistance_kg is null or assistance_kg >= 0),
  added_weight_kg numeric check (added_weight_kg is null or added_weight_kg >= 0),
  left_reps int check (left_reps is null or left_reps >= 0),
  right_reps int check (right_reps is null or right_reps >= 0),
  rpe numeric check (rpe is null or rpe between 1 and 10),
  rir numeric check (rir is null or rir between 0 and 10),
  is_completed boolean not null default false,
  completed_at timestamptz,
  notes text,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_sets_updated before update on public.sets
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ body + misc
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measurement_type text not null
    check (measurement_type in ('weight','waist','chest','hips','upper_arm','forearm','thigh','calf','neck','custom')),
  custom_label text,
  value numeric not null check (value > 0 and value < 1000),
  unit text not null check (unit in ('kg','lb','cm','in')),
  measured_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_measure_updated before update on public.body_measurements
  for each row execute function public.set_updated_at();

create table if not exists public.exercise_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  note_type text not null default 'setup' check (note_type in ('setup','technique','general')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_exnotes_updated before update on public.exercise_notes
  for each row execute function public.set_updated_at();

create table if not exists public.exercise_settings (  -- per-user progression + favorites
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  is_favorite boolean not null default false,
  progression_enabled boolean not null default true,
  progression_rule text not null default 'double' check (progression_rule in ('double','none')),
  min_reps int,
  max_reps int,
  increment_kg numeric check (increment_kg is null or increment_kg > 0),
  default_rest_seconds int,
  unique (user_id, exercise_id)
);

create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  record_type text not null check (record_type in ('max_weight','max_reps_at_load','est_1rm','session_volume','longest_duration','longest_distance')),
  value numeric not null,
  unit text not null,
  session_id uuid references public.workout_sessions(id) on delete cascade,
  set_id uuid references public.sets(id) on delete cascade,
  achieved_at timestamptz not null,
  is_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, exercise_id, record_type, set_id)   -- no duplicates from repeated sync
);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  photo_category text check (photo_category is null or photo_category in ('front','side','back')),
  captured_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_name text not null,
  is_available boolean not null default true,
  notes text,
  unique (user_id, equipment_name)
);

create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('exercise_target','body_measurement','monthly_workouts','consistency','custom')),
  title text not null,
  exercise_id uuid references public.exercises(id) on delete set null,
  target_value numeric,
  target_unit text,
  start_date date not null default current_date,
  target_date date,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_goals_updated before update on public.user_goals
  for each row execute function public.set_updated_at();
