# ✈️ Infinite Dispatch

**Infinite Dispatch** is a Virtual Airline career tracker and economy system for **Infinite Flight**, backed by **Supabase** (auth + database) and deployed as a **Vercel frontend**.

---

## 🌟 Key Features

### 1. License & Rank Progression
Pilots advance through a standardized progression:
- **PPL / FO** → 1.0×
- **CPL / SFO** → 1.5×
- **MPL / CPT** → 2.0×
- **ATPL / SR CPT** → 2.5×

### 2. Fixed Job Market
Job slots are fixed by total hours:
- 0–150: **2**
- 150–350: **4**
- 350–550: **5**
- 550–650: **7**
- 650–900: **8**
- 900+: **9–18** (fluctuates)

### 3. Type-Rating Driven Jobs
- New accounts start with **one random type rating**.
- Job Market offers are generated only for aircraft types the pilot is rated on.
- Airlines shown in offers must have that aircraft type available in Infinite Flight liveries.
- Buying additional type ratings expands eligible airline/job offers.

### 4. Base Airport Lock
Your base airport is chosen at signup and **cannot be changed**.
Generated routes are still built from your base airport.

### 5. Job Refresh Limits
- Pilots can manually refresh the Job Market up to **2 times every 36 hours**.
- Admins can override the refresh limit per profile in the admin portal.

---

## ✅ Supabase Setup

1. Create a Supabase project.
2. Run this SQL in **SQL Editor**:

```sql
create table if not exists public.profiles (
  id uuid primary key,
  username text unique not null,
  base_airport text not null,
  employer text not null,
  hours integer not null default 0,
  balance integer not null default 500,
  license text not null default 'PPL',
  position text not null default 'FO',
  pay_multiplier numeric not null default 1.0,
  job_slots integer not null default 2,
  type_ratings text[] not null default '{}',
  job_refreshes_used integer not null default 0,
  job_refresh_window_started_at timestamp with time zone,
  job_refresh_admin_override boolean not null default false,
  job_acceptance_admin_override boolean not null default false,
  simbrief_tracking_admin_enabled boolean not null default false,
  discourse_username text,
  ifc_link_status text not null default 'unlinked',
  ifc_link_code text,
  ifc_link_verified_at timestamp with time zone,
  ifc_link_last_checked_at timestamp with time zone,
  ifc_link_last_error text,
  created_at timestamp with time zone default now()
);

create table if not exists public.flight_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  flight_number text,
  airline_icao text,
  origin text,
  destination text,
  aircraft text,
  plan_json jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.flight_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  callsign text,
  origin text,
  destination text,
  status text default 'enroute',
  server_type text default 'casual',
  last_lat double precision,
  last_lng double precision,
  last_alt double precision,
  last_speed double precision,
  identity_link_status text,
  identity_link_username text,
  identity_link_verified_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;
alter table public.flight_plans enable row level security;
alter table public.flight_tracking enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can read own flight plans"
on public.flight_plans for select
using (auth.uid() = user_id);

create policy "Users can insert own flight plans"
on public.flight_plans for insert
with check (auth.uid() = user_id);

create policy "Users can read own tracking"
on public.flight_tracking for select
using (auth.uid() = user_id);

create policy "Users can insert own tracking"
on public.flight_tracking for insert
with check (auth.uid() = user_id);

-- IMPORTANT: grant table privileges to authenticated users
grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.flight_plans to authenticated;
grant select, insert, update, delete on table public.flight_tracking to authenticated;
```

If your tables already exist, apply these migration-safe updates:

```sql
alter table public.profiles add column if not exists discourse_username text;
alter table public.profiles add column if not exists ifc_link_status text not null default 'unlinked';
alter table public.profiles add column if not exists ifc_link_code text;
alter table public.profiles add column if not exists ifc_link_verified_at timestamp with time zone;
alter table public.profiles add column if not exists ifc_link_last_checked_at timestamp with time zone;
alter table public.profiles add column if not exists ifc_link_last_error text;
alter table public.profiles add column if not exists simbrief_tracking_admin_enabled boolean not null default false;
alter table public.profiles add column if not exists job_acceptance_admin_override boolean not null default false;

alter table public.flight_tracking add column if not exists identity_link_status text;
alter table public.flight_tracking add column if not exists identity_link_username text;
alter table public.flight_tracking add column if not exists identity_link_verified_at timestamp with time zone;
```

Recommended integrity constraints:

```sql
alter table public.profiles
  add constraint profiles_hours_non_negative check (hours >= 0),
  add constraint profiles_balance_non_negative check (balance >= 0),
  add constraint profiles_job_slots_non_negative check (job_slots >= 0),
  add constraint profiles_license_valid check (license in ('PPL', 'CPL', 'MPL', 'ATPL')),
  add constraint profiles_position_valid check (position in ('FO', 'SFO', 'CPT', 'SR CPT')),
  add constraint profiles_base_airport_icao check (base_airport ~ '^[A-Z]{4}$');

alter table public.flight_tracking
  add constraint flight_tracking_status_valid check (status in ('enroute', 'completed', 'cancelled')),
  add constraint flight_tracking_server_type_valid check (server_type in ('casual', 'training', 'expert'));
```

### CabinCue schema + storage (run migration)

CabinCue uses versioned profile data with release history and media asset storage.

Run the migration file:

```bash
supabase migration up
```

Or apply the SQL from:

```text
supabase/migrations/20260521020000_cabincue.sql
```

It creates:
- `cabincue_profiles` (airline profile definitions + active public version pointer)
- `cabincue_profile_versions` (draft vs released versions, release timestamp)
- `cabincue_announcement_items` (category/media announcement items ordered per version)
- `cabincue_release_records` (release and rollback history)
- `cabincue-assets` storage bucket with MP3/MP4-only upload policies and size caps

Seeded profiles:
- Generic
- Singapore Airlines

3. In **Auth → Providers**, enable **Email**.

---

## 🔐 Configure Supabase Keys
Update `public/config.js` with your values:

```js
window.SUPABASE_URL = "YOUR_SUPABASE_URL";
window.SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
```

⚠️ Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend/admin pages.  
Keep it only in server-side secrets (e.g., Supabase Edge Function secrets) and use server endpoints for privileged actions.

---

## 🛠️ Local Setup

```bash
npm install
npm start
```
Then open: `http://localhost:3000`

By default, `server.js` runs static hosting + telemetry endpoint only, with production behavior relying on Supabase auth/data.
If you need the legacy in-memory demo API routes, run:

```bash
LOCAL_DEMO_MODE=1 npm start
```

Run basic automated checks:

```bash
npm test
```

---

## 🚀 Vercel Deployment

This project is frontend-only on Vercel. Deploy the repo, and make sure your `public/config.js` is filled with your Supabase URL + publishable key before deployment.

---

## ✈️ Infinite Flight Tracking (No Command Line)

You can set up tracking using the Supabase Dashboard only.

### 1) Create the Edge Function
1. Open **Supabase Dashboard → Edge Functions**.
2. Click **Create a new function**.
3. Name it: `if-tracker`.
4. Replace the code with the content from:
   `supabase/functions/if-tracker/index.ts` in this repo.
5. Click **Deploy**.

### 2) Add Secrets
Go to **Project Settings → Secrets** or **Vault** and add:
- `IF_API_KEY` = your Infinite Flight Live API key
- `SUPABASE_URL` = your project URL (https://<ref>.supabase.co)
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key

### 3) Schedule the Function
In **Edge Functions → if-tracker → Schedule**, set:
```
*/10 * * * *
```
(Every 10 minutes to respect `/sessions` minimum polling interval)

The tracker validates completion (destination proximity + landing profile) before marking a flight completed and awarding pay/hours.
It also applies a 48-hour grace window from flight start before missing flights can be completed, plus callsign-family reconciliation so brief pauses or split legs do not prematurely end tracking.
Tracking rows can also include identity-link metadata (`identity_link_*`) captured from the pilot profile at dispatch time.

### 4) Optional On-Demand Live Lookup (Immediate Refresh)
Use the same `if-tracker` function in on-demand mode when you need a live "find my current flight now" check for one active row.

- Method: `POST`
- URL: `https://<project-ref>.functions.supabase.co/if-tracker?mode=on-demand`
- Body: provide either `tracking_id` or `user_id`

Example body:
```json
{ "user_id": "<auth-user-uuid>" }
```

Response includes:
- `found` and `match_method` (`identity`, `callsign`, or `reconciled`)
- `live_flight` details when a match is found
- `session_id` and resolved `server_type`

This on-demand mode keeps the same matching order as scheduled tracking and preserves existing API failure behavior (`/sessions` returns 502 on failure, `/flights` failures degrade to empty results).

### Optional: Isolated Debug Tracking (Recommended)
Use a completely separate table + function so debug runs never touch real user tracking rows.

1. Create a debug table:
```sql
create table if not exists public.flight_tracking_debug (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  callsign text,
  origin text,
  destination text,
  status text default 'enroute',
  server_type text default 'casual',
  last_lat double precision,
  last_lng double precision,
  last_alt double precision,
  last_speed double precision,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

alter table public.flight_tracking_debug enable row level security;

create policy "Users can read own debug tracking"
on public.flight_tracking_debug for select
using (auth.uid() = user_id);

create policy "Users can insert own debug tracking"
on public.flight_tracking_debug for insert
with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.flight_tracking_debug to authenticated;
```

2. Create a second edge function in **Supabase Dashboard → Edge Functions**:
   - Click **Create a new function**
   - Name it `if-tracker-debug`
   - Open `supabase/functions/if-tracker-debug/index.ts` in this repo and copy-paste its full contents into the dashboard editor
   - Deploy it
3. Use your internal debug tracking page only with this debug table/function path.
   - The page also includes IFC link debug controls for profile identity-link fields.
   - Invoke the `if-tracker-debug` function URL when you want to process debug rows.
4. Do not schedule `if-tracker-debug` in place of production `if-tracker`.

---

## 🛫 AirLabs Airline Routes Integration (Supabase Edge Function)

The app now uses a backend Edge Function for route schedules so API keys stay server-side.

### 1) Create the Edge Function
1. Open **Supabase Dashboard → Edge Functions**.
2. Click **Create a new function**.
3. Name it: `airlabs-routes`.
4. Replace the code with:
   `supabase/functions/airlabs-routes/index.ts` from this repo.
5. Click **Deploy**.

### 2) Add Secrets
In **Project Settings → Secrets** or **Vault**, add:
- `AIRLABS_API_KEY` = your AirLabs API key

### 3) Security Requirement
- Do **not** place AirLabs keys in frontend files.
- If any AirLabs key was ever exposed publicly, rotate it immediately in AirLabs dashboard and update only `AIRLABS_API_KEY` in Supabase secrets.

The frontend will call this function for route candidates and automatically falls back to curated local routes if no usable AirLabs routes are returned.

---

## 📘 User Guide

Open `/user-guide/` (or `public/user-guide.html`) or use the in-app link to view the guide.

---

*Built by @novariaportal*
