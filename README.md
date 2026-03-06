# World Trail Chronicles

World Trail Chronicles is a browser app that shows your country visits on an interactive map timeline.

The current implementation uses:
- Supabase Auth for login/signup
- a Supabase `visits` table for persisted data
- a Supabase RPC (`verify_invitation`) to validate the signup magic key
- amCharts v5 world map for visualization

## Current Features

- Email/password login
- Signup gated by a magic key
- Inline auth error messages for login/signup failures
- Account deletion with double confirmation
- Timeline slider that highlights:
  - past visited countries (gray)
  - selected year countries (orange)
- Edit mode for adding/deleting visits
- Play/pause and reset timeline controls

## Run Locally

1. Start a static server from the project directory:

```sh
cd /Users/schilkunda-air/Desktop/projects/world-trail-chronicles
python3 -m http.server 8000
```

2. Open:

`http://localhost:8000`

## Configuration

Supabase credentials are configured in `script.js`:

- `supabaseUrl`
- `supabaseKey` (anon/publishable key)

If placeholders are used (`YOUR_PROJECT_ID`, `YOUR_ANON_KEY`), login/signup is intentionally blocked and the UI shows a setup error.

## Required Supabase Setup

### 1. Auth

- Enable Email/Password provider.

### 2. `visits` table

Create a table with at least:
- `id` (primary key)
- `user_id` (`uuid`, linked to `auth.users.id`)
- `year` (`int`)
- `country` (`text`)

Example:

```sql
create table if not exists public.visits (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  country text not null
);
```

### 3. RLS policies

Enable RLS and allow users to read/write only their own rows.

Example:

```sql
alter table public.visits enable row level security;

create policy "select own visits"
on public.visits
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert own visits"
on public.visits
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "delete own visits"
on public.visits
for delete
to authenticated
using (auth.uid() = user_id);
```

### 4. `verify_invitation` RPC

Signup calls `verify_invitation` before creating the user.

The frontend currently supports either parameter style:
- `input_email`, `input_key`
- `email`, `key`

Return shape can be:
- `boolean`
- array/object containing one of: `is_valid`, `valid`, `result` (boolean)

### 5. Account deletion Edge Function

Account deletion is done by `supabase/functions/delete-account/index.ts` and must be deployed.

Deploy steps:

```sh
supabase login
supabase link --project-ref prxcpbiztxjxocefxfmh
supabase functions deploy delete-account
```

Required function secrets (normally already present in hosted Supabase):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Troubleshooting

- `Login failed: ...`
  - Check `supabaseUrl`/`supabaseKey`
  - Confirm Email/Password auth is enabled
- `Magic key verification failed: ...`
  - RPC function missing, wrong parameter names, or function error
- `Invalid Magic Key.`
  - RPC executed successfully but returned false
  - Check key value, casing, trimming, and email match
- Visit data not loading/saving
  - Verify `visits` table and RLS policies
- `Account deletion failed: ...`
  - Deploy `delete-account` Edge Function
  - Confirm function has `SUPABASE_SERVICE_ROLE_KEY`
  - Check function logs:
    - `supabase functions logs delete-account`

## Notes

- Account deletion requires the Edge Function; direct browser calls to Supabase Auth delete endpoints are typically blocked.
