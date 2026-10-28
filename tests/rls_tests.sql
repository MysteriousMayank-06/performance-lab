-- Cross-account security test. Run in the Supabase SQL editor AFTER creating two test users (A and B).
-- Replace the two UUIDs below with real ids from Authentication > Users. Everything rolls back at the end.
begin;
set local role authenticated;

-- ===== act as user A: create data =====
select set_config('request.jwt.claims', json_build_object('sub','AAAAAAAA-0000-4000-8000-000000000001','role','authenticated')::text, true);
insert into public.routines (id, user_id, name) values ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','AAAAAAAA-0000-4000-8000-000000000001','A private routine');
insert into public.body_measurements (user_id, measurement_type, value, unit, measured_at) values ('AAAAAAAA-0000-4000-8000-000000000001','weight',80,'kg',now());

-- ===== act as user B: everything below must return 0 rows / affect 0 rows =====
select set_config('request.jwt.claims', json_build_object('sub','BBBBBBBB-0000-4000-8000-000000000002','role','authenticated')::text, true);
select 'B reads A routines (expect 0)' as test, count(*) from public.routines where user_id = 'AAAAAAAA-0000-4000-8000-000000000001';
select 'B reads A measurements (expect 0)' as test, count(*) from public.body_measurements where user_id = 'AAAAAAAA-0000-4000-8000-000000000001';
with u as (update public.routines set name = 'hacked' where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' returning 1) select 'B updates A routine (expect 0)' as test, count(*) from u;
with d as (delete from public.body_measurements where user_id = 'AAAAAAAA-0000-4000-8000-000000000001' returning 1) select 'B deletes A measurement (expect 0)' as test, count(*) from d;
-- B must not be able to insert a row owned by A (expect an error: new row violates row-level security policy)
-- insert into public.routines (user_id, name) values ('AAAAAAAA-0000-4000-8000-000000000001','spoof');
-- System exercises are readable but not writable by ordinary users
select 'B reads system exercises (expect > 0)' as test, count(*) from public.exercises where is_system;
with u as (update public.exercises set name = 'hacked' where is_system returning 1) select 'B edits system exercise (expect 0)' as test, count(*) from u;
rollback;
