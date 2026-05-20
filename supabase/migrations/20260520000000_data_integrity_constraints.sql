do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_hours_non_negative') then
    alter table public.profiles add constraint profiles_hours_non_negative check (hours >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_balance_non_negative') then
    alter table public.profiles add constraint profiles_balance_non_negative check (balance >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_job_slots_non_negative') then
    alter table public.profiles add constraint profiles_job_slots_non_negative check (job_slots >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_license_valid') then
    alter table public.profiles add constraint profiles_license_valid check (license in ('PPL', 'CPL', 'MPL', 'ATPL'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_position_valid') then
    alter table public.profiles add constraint profiles_position_valid check (position in ('FO', 'SFO', 'CPT', 'SR CPT'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_base_airport_icao') then
    alter table public.profiles add constraint profiles_base_airport_icao check (base_airport ~ '^[A-Z]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flight_tracking_status_valid') then
    alter table public.flight_tracking add constraint flight_tracking_status_valid check (status in ('enroute', 'completed', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flight_tracking_server_type_valid') then
    alter table public.flight_tracking add constraint flight_tracking_server_type_valid check (server_type in ('casual', 'training', 'expert'));
  end if;
end $$;
