-- Performance Lab — 002 indexes
create index if not exists idx_exercises_owner on public.exercises(owner_id);
create index if not exists idx_exercises_name on public.exercises(normalized_name);
create index if not exists idx_exercises_primary on public.exercises using gin (primary_muscles);
create index if not exists idx_exercises_equipment on public.exercises using gin (equipment);

create index if not exists idx_routines_user on public.routines(user_id) where archived_at is null;
create index if not exists idx_routine_ex_routine on public.routine_exercises(routine_id, position);
create index if not exists idx_schedule_user on public.routine_schedule(user_id, weekday);

create index if not exists idx_sessions_user_started on public.workout_sessions(user_id, started_at desc);
create index if not exists idx_sessions_user_status on public.workout_sessions(user_id, status);
create index if not exists idx_session_ex_session on public.session_exercises(session_id, position);
create index if not exists idx_session_ex_exercise on public.session_exercises(exercise_id);
create index if not exists idx_sets_session_ex on public.sets(session_exercise_id, set_number);

create index if not exists idx_measure_user_type on public.body_measurements(user_id, measurement_type, measured_at desc);
create index if not exists idx_pr_user_ex on public.personal_records(user_id, exercise_id, record_type);
create index if not exists idx_photos_user on public.progress_photos(user_id, captured_at desc);
create index if not exists idx_goals_user on public.user_goals(user_id, status);
