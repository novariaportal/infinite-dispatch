create extension if not exists pgcrypto;

create table if not exists public.cabincue_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  source_profile_id uuid references public.cabincue_profiles(id) on delete set null,
  active_public_version_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.cabincue_profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.cabincue_profiles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'released')),
  version_label text,
  notes text,
  released_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (profile_id, version_number)
);

alter table public.cabincue_profiles
  drop constraint if exists cabincue_profiles_active_public_version_id_fkey;

alter table public.cabincue_profiles
  add constraint cabincue_profiles_active_public_version_id_fkey
  foreign key (active_public_version_id)
  references public.cabincue_profile_versions(id)
  on delete set null;

create table if not exists public.cabincue_announcement_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.cabincue_profile_versions(id) on delete cascade,
  announcement_key text not null,
  category text not null check (category in ('boarding', 'departure-prep', 'safety-video', 'descent-landing', 'other-announcements')),
  title text not null,
  description text,
  media_kind text not null check (media_kind in ('audio', 'video')),
  asset_path text,
  asset_mime text,
  asset_size_bytes bigint,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (version_id, announcement_key),
  check (asset_size_bytes is null or asset_size_bytes > 0),
  check (
    asset_path is null
    or (
      (media_kind = 'audio' and asset_path ~* '\\.mp3$')
      or (media_kind = 'video' and asset_path ~* '\\.mp4$')
    )
  )
);

create table if not exists public.cabincue_release_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.cabincue_profiles(id) on delete cascade,
  version_id uuid not null references public.cabincue_profile_versions(id) on delete restrict,
  rollback_from_version_id uuid references public.cabincue_profile_versions(id) on delete set null,
  released_at timestamp with time zone not null default now(),
  released_by uuid,
  notes text
);

create index if not exists cabincue_versions_profile_status_idx on public.cabincue_profile_versions(profile_id, status, released_at desc);
create index if not exists cabincue_items_version_order_idx on public.cabincue_announcement_items(version_id, sort_order);
create index if not exists cabincue_release_profile_idx on public.cabincue_release_records(profile_id, released_at desc);

alter table public.cabincue_profiles enable row level security;
alter table public.cabincue_profile_versions enable row level security;
alter table public.cabincue_announcement_items enable row level security;
alter table public.cabincue_release_records enable row level security;

-- Public readers can only see active released content.
drop policy if exists "Public read CabinCue profiles" on public.cabincue_profiles;
create policy "Public read CabinCue profiles"
on public.cabincue_profiles for select
using (true);

drop policy if exists "Public read CabinCue released versions" on public.cabincue_profile_versions;
create policy "Public read CabinCue released versions"
on public.cabincue_profile_versions for select
using (
  status = 'released'
  and exists (
    select 1
    from public.cabincue_profiles p
    where p.id = cabincue_profile_versions.profile_id
      and p.active_public_version_id = cabincue_profile_versions.id
  )
);

drop policy if exists "Public read CabinCue released items" on public.cabincue_announcement_items;
create policy "Public read CabinCue released items"
on public.cabincue_announcement_items for select
using (
  exists (
    select 1
    from public.cabincue_profile_versions v
    join public.cabincue_profiles p on p.id = v.profile_id
    where v.id = cabincue_announcement_items.version_id
      and v.status = 'released'
      and p.active_public_version_id = v.id
  )
);

drop policy if exists "Public read CabinCue release records" on public.cabincue_release_records;
create policy "Public read CabinCue release records"
on public.cabincue_release_records for select
using (true);

-- Authenticated users (admin/dev users) can manage CabinCue entities.
drop policy if exists "Authenticated manage CabinCue profiles" on public.cabincue_profiles;
create policy "Authenticated manage CabinCue profiles"
on public.cabincue_profiles for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated manage CabinCue versions" on public.cabincue_profile_versions;
create policy "Authenticated manage CabinCue versions"
on public.cabincue_profile_versions for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated manage CabinCue items" on public.cabincue_announcement_items;
create policy "Authenticated manage CabinCue items"
on public.cabincue_announcement_items for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated manage CabinCue releases" on public.cabincue_release_records;
create policy "Authenticated manage CabinCue releases"
on public.cabincue_release_records for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

grant select on public.cabincue_profiles to anon, authenticated;
grant select on public.cabincue_profile_versions to anon, authenticated;
grant select on public.cabincue_announcement_items to anon, authenticated;
grant select on public.cabincue_release_records to anon, authenticated;
grant insert, update, delete on public.cabincue_profiles to authenticated;
grant insert, update, delete on public.cabincue_profile_versions to authenticated;
grant insert, update, delete on public.cabincue_announcement_items to authenticated;
grant insert, update, delete on public.cabincue_release_records to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cabincue-assets',
  'cabincue-assets',
  true,
  157286400,
  array['audio/mpeg', 'video/mp4']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read CabinCue storage" on storage.objects;
create policy "Public read CabinCue storage"
on storage.objects for select
using (bucket_id = 'cabincue-assets');

drop policy if exists "Authenticated upload CabinCue storage" on storage.objects;
create policy "Authenticated upload CabinCue storage"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cabincue-assets'
  and (
    (
      lower(storage.extension(name)) = 'mp3'
      and coalesce(metadata->>'mimetype', '') = 'audio/mpeg'
      and coalesce((metadata->>'size')::bigint, 0) between 1 and 15728640
    )
    or
    (
      lower(storage.extension(name)) = 'mp4'
      and coalesce(metadata->>'mimetype', '') = 'video/mp4'
      and coalesce((metadata->>'size')::bigint, 0) between 1 and 157286400
    )
  )
);

drop policy if exists "Authenticated update CabinCue storage" on storage.objects;
create policy "Authenticated update CabinCue storage"
on storage.objects for update
to authenticated
using (bucket_id = 'cabincue-assets')
with check (
  bucket_id = 'cabincue-assets'
  and (
    (
      lower(storage.extension(name)) = 'mp3'
      and coalesce(metadata->>'mimetype', '') = 'audio/mpeg'
      and coalesce((metadata->>'size')::bigint, 0) between 1 and 15728640
    )
    or
    (
      lower(storage.extension(name)) = 'mp4'
      and coalesce(metadata->>'mimetype', '') = 'video/mp4'
      and coalesce((metadata->>'size')::bigint, 0) between 1 and 157286400
    )
  )
);

drop policy if exists "Authenticated delete CabinCue storage" on storage.objects;
create policy "Authenticated delete CabinCue storage"
on storage.objects for delete
to authenticated
using (bucket_id = 'cabincue-assets');

with seeded_profiles as (
  insert into public.cabincue_profiles (slug, display_name)
  values
    ('generic', 'Generic'),
    ('singapore-airlines', 'Singapore Airlines')
  on conflict (slug) do update
    set display_name = excluded.display_name,
        updated_at = now()
  returning id, slug
),
profile_ids as (
  select id, slug from seeded_profiles
  union
  select id, slug from public.cabincue_profiles where slug in ('generic', 'singapore-airlines')
),
version_rows as (
  insert into public.cabincue_profile_versions (profile_id, version_number, status, version_label, notes, released_at)
  select id, 1, 'released', 'v1', 'Initial CabinCue seed profile.', now()
  from profile_ids
  on conflict (profile_id, version_number) do update
    set status = 'released',
        version_label = excluded.version_label,
        notes = excluded.notes,
        released_at = coalesce(public.cabincue_profile_versions.released_at, excluded.released_at),
        updated_at = now()
  returning id, profile_id
),
existing_or_new_versions as (
  select id, profile_id from version_rows
  union
  select v.id, v.profile_id
  from public.cabincue_profile_versions v
  join profile_ids p on p.id = v.profile_id
  where v.version_number = 1
)
insert into public.cabincue_announcement_items (
  version_id,
  announcement_key,
  category,
  title,
  description,
  media_kind,
  sort_order,
  is_active
)
select
  v.id,
  tmpl.announcement_key,
  tmpl.category,
  tmpl.title,
  tmpl.description,
  tmpl.media_kind,
  tmpl.sort_order,
  true
from existing_or_new_versions v
cross join (
  values
    ('boarding_welcome', 'boarding', 'Boarding Welcome', 'Initial boarding welcome message.', 'audio', 10),
    ('departure_prep', 'departure-prep', 'Departure Preparation', 'Cabin secured and departure prep message.', 'audio', 20),
    ('safety_video', 'safety-video', 'Safety Video', 'Primary safety video announcement slot.', 'video', 30),
    ('descent_landing', 'descent-landing', 'Descent and Landing', 'Arrival and cabin prep for landing.', 'audio', 40),
    ('other_announcements', 'other-announcements', 'Other Announcements', 'Additional discretionary announcement slot.', 'video', 50)
) as tmpl(announcement_key, category, title, description, media_kind, sort_order)
on conflict (version_id, announcement_key) do nothing;

update public.cabincue_profiles p
set active_public_version_id = v.id,
    updated_at = now()
from public.cabincue_profile_versions v
where v.profile_id = p.id
  and v.version_number = 1
  and v.status = 'released'
  and p.slug in ('generic', 'singapore-airlines');

insert into public.cabincue_release_records (profile_id, version_id, rollback_from_version_id, notes)
select p.id, p.active_public_version_id, null, 'Initial CabinCue seed release.'
from public.cabincue_profiles p
where p.slug in ('generic', 'singapore-airlines')
  and p.active_public_version_id is not null
  and not exists (
    select 1
    from public.cabincue_release_records r
    where r.profile_id = p.id
      and r.version_id = p.active_public_version_id
  );
