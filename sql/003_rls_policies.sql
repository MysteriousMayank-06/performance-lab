-- ============================================================================
-- Performance Lab — 003 Row Level Security
-- Every user-owned table is locked to auth.uid(). Child tables check ownership
-- through their parent, never a client-supplied user id.
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.exercises          enable row level security;
alter table public.routines           enable row level security;
alter table public.routine_exercises  enable row level security;
alter table public.routine_schedule   enable row level security;
alter table public.workout_sessions   enable row level security;
alter table public.session_exercises  enable row level security;
alter table public.sets               enable row level security;
alter table public.body_measurements  enable row level security;
alter table public.exercise_notes     enable row level security;
alter table public.exercise_settings  enable row level security;
alter table public.personal_records   enable row level security;
alter table public.progress_photos    enable row level security;
alter table public.user_equipment     enable row level security;
alter table public.user_goals         enable row level security;

-- profiles: own row only (insert is done by the signup trigger, but allow self-insert as a fallback)
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own" on public.profiles for delete to authenticated using (id = auth.uid());

-- exercises: system rows readable by all signed-in users; custom rows are private to the owner
create policy "exercises_select" on public.exercises for select to authenticated
  using (is_system or owner_id = auth.uid());
create policy "exercises_insert_own" on public.exercises for insert to authenticated
  with check (not is_system and owner_id = auth.uid());
create policy "exercises_update_own" on public.exercises for update to authenticated
  using (not is_system and owner_id = auth.uid()) with check (not is_system and owner_id = auth.uid());
create policy "exercises_delete_own" on public.exercises for delete to authenticated
  using (not is_system and owner_id = auth.uid());

-- routines
create policy "routines_all_own" on public.routines for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- routine_exercises: via parent routine; exercise must be a system exercise or the user's own
create policy "routine_ex_select" on public.routine_exercises for select to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));
create policy "routine_ex_modify" on public.routine_exercises for all to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (
    exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
    and exists (select 1 from public.exercises e where e.id = exercise_id and (e.is_system or e.owner_id = auth.uid()))
  );

create policy "schedule_all_own" on public.routine_schedule for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (routine_id is null or exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())));

-- workout sessions + children
create policy "sessions_all_own" on public.workout_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "session_ex_all_own" on public.session_exercises for all to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (
    exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid())
    and (exercise_id is null or exists (select 1 from public.exercises e where e.id = exercise_id and (e.is_system or e.owner_id = auth.uid())))
  );

create policy "sets_all_own" on public.sets for all to authenticated
  using (exists (
    select 1 from public.session_exercises se join public.workout_sessions s on s.id = se.session_id
    where se.id = session_exercise_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from public.session_exercises se join public.workout_sessions s on s.id = se.session_id
    where se.id = session_exercise_id and s.user_id = auth.uid()));

-- simple owner tables
create policy "measure_all_own"  on public.body_measurements for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exnotes_all_own"  on public.exercise_notes    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exsettings_all_own" on public.exercise_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pr_all_own"       on public.personal_records  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "photos_all_own"   on public.progress_photos   for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "equipment_all_own" on public.user_equipment   for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "goals_all_own"    on public.user_goals        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ----------------------------------------------------------------- Storage
-- Private bucket for progress photos. Files live at  <user_id>/<filename>.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "photos_storage_select" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------- Account deletion
-- Lets a signed-in user delete THEIR OWN account without a service-role key in the browser.
-- Deleting the auth.users row cascades to every table above. Narrow, reviewed SECURITY DEFINER:
-- it can only ever delete auth.uid().
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth, storage as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from storage.objects where bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
