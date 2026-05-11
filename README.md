# ✈️ Infinite Dispatch

**Infinite Dispatch** is a Virtual Airline career tracker and economy system for **Infinite Flight**, now backed by **Supabase** (auth + database) and deployed as a **Vercel frontend**.

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

alter table public.profiles enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);
```

3. In **Auth → Providers**, enable **Email**.

---

## 🔐 Configure Supabase Keys
Update `public/config.js` with your values:

```js
window.SUPABASE_URL = "YOUR_SUPABASE_URL";
window.SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

---

## 🛠️ Local Setup

```bash
npm install
npm start
```
Then open: `http://localhost:3000`

---

## 🚀 Vercel Deployment

This project is frontend-only on Vercel. Deploy the repo, and make sure your `public/config.js` is filled with your Supabase URL + anon key before deployment.

---

*Built by @novariaportal*
