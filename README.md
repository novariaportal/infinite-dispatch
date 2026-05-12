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

### 3. Base Airport Lock
Your base airport is chosen at signup and **cannot be changed**.
Your employer is automatically aligned to that base, and generated jobs stay within that airline's network.

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
*/2 * * * *
```
(Every 2 minutes)

The tracker validates completion (destination proximity + landing profile) before marking a flight completed and awarding pay/hours.

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

Open `public/user-guide.html` or use the in-app link to view the guide.

---

*Built by @novariaportal*
