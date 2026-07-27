-- ============================================================
--  ZetaDesk — Supabase schema (run once in the SQL Editor)
-- ============================================================
--  This is the SAFE foundation: every record lives in its own row,
--  in its own table. Two people editing different records can never
--  collide, and no single browser tab can ever blank the whole book —
--  the failure mode that affected the previous app is impossible here.
--
--  Access is restricted to signed-in team members. Only authenticated
--  users can read or write; anonymous visitors get nothing.
-- ============================================================

-- ---------- Helper: auto-update an updated_at column ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- CLIENTS ----------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  contact_person text,
  phone text,
  email text,
  data jsonb default '{}'::jsonb,          -- flexible extra fields
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- INSURERS (directory) ----------
create table if not exists insurers (
  id uuid primary key default gen_random_uuid(),
  insurer text not null,
  branch text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- VENDORS (POSP / survey partners) ----------
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- PRODUCTS (master taxonomy) ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text,
  category text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- OPPORTUNITIES (RFQ pipeline) ----------
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  title text,
  stage text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- POLICIES ----------
create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  source_opportunity_id uuid references opportunities(id) on delete set null,
  insured_name text,
  policy_no text,
  policy_type text,
  status text default 'Draft',
  period_from date,
  period_to date,
  data jsonb default '{}'::jsonb,          -- premium, cover, insurer, marine settings, endorsements, etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- MARINE DECLARATIONS (SI ledger, one row per entry) ----------
create table if not exists marine_declarations (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  pool_id uuid,
  period_start date,
  period_end date,
  seq int,
  transaction_type text,                   -- Bulk Declaration | Quick Declaration | Endorsement | Renewal
  data jsonb default '{}'::jsonb,          -- covered value, balances, certificate flag, etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- MARINE SI POOLS ----------
-- A marine policy holds one or more pools. A pool covers ONE voyage type
-- (separate limit) or SEVERAL voyage types sharing one limit (combined).
-- Declarations deduct from the pool they are filed against.
create table if not exists marine_pools (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  label text,
  si_limit numeric default 0,
  rate_pct numeric default 0,
  data jsonb default '{}'::jsonb,   -- voyageTypes[], specialReference, subjectMatter
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- MARINE ENDORSEMENTS ----------
-- SI Enhancement (premium at pool rate unless a special-voyage rate is given),
-- Early Expiry (re-cuts the remaining declaration schedule), voyage additions.
create table if not exists marine_endorsements (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  pool_id uuid references marine_pools(id) on delete cascade,
  endorsement_type text,
  effective_date date,
  data jsonb default '{}'::jsonb,   -- amount, ratePct, premium, newExpiry, narration
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- MEMBERS (lives under GMC/GHI and GPA policies) ----------
-- One row per life. Serves both GMC (relationship, DOB, dependants) and GPA
-- (salary, occupation, category) - the scheme-specific fields ride in `data`.
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  member_code text,
  member_name text,
  status text default 'Active',
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- BENEFIT ENDORSEMENTS (GMC / GPA) ----------
-- One endorsement may move several members; the movements are held in `data`
-- so an endorsement stays a single auditable document.
create table if not exists benefit_endorsements (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  endorsement_no text,
  endorsement_type text,
  effective_date date,
  status text default 'Pending',
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- CD ACCOUNT LEDGER ----------
-- Cash deposit account. Addition premiums debit, deletion refunds credit.
create table if not exists cd_ledger (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  txn_date date,
  txn_type text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- PROPERTY LOCATIONS ----------
-- Location-wise sum insured bifurcation for fire / property policies.
create table if not exists property_locations (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  location_name text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- PROJECT INSTALMENTS ----------
create table if not exists project_instalments (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  instalment_no int,
  due_date date,
  status text default 'Upcoming',
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- PROJECT EXTENSIONS ----------
create table if not exists project_extensions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  extension_no text,
  new_expiry date,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- CLAIMS ----------
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  claim_no text,
  status text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- TEAM MEMBERS (RM list for call/visit scheduling) ----------
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- CALLS (standalone daily call log — not linked to clients) ----------
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  rm_name text,
  company_name text,
  call_date date,
  status text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- VISITS (standalone visit schedule — not linked to clients) ----------
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  rm_name text,
  company_name text,
  visit_date date,
  status text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['clients','insurers','vendors','products','opportunities','policies','marine_declarations','claims','team_members','calls','visits','marine_pools','marine_endorsements','members','benefit_endorsements','cd_ledger','property_locations','project_instalments','project_extensions']
  loop
    execute format('drop trigger if exists trg_%s_updated on %s;', t, t);
    execute format('create trigger trg_%s_updated before update on %s for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- ============================================================
--  ROW LEVEL SECURITY — only signed-in team members
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['clients','insurers','vendors','products','opportunities','policies','marine_declarations','claims','team_members','calls','visits','marine_pools','marine_endorsements','members','benefit_endorsements','cd_ledger','property_locations','project_instalments','project_extensions']
  loop
    execute format('alter table %s enable row level security;', t);
    execute format('drop policy if exists "team read" on %s;', t);
    execute format('drop policy if exists "team write" on %s;', t);
    execute format('drop policy if exists "team update" on %s;', t);
    execute format('drop policy if exists "team delete" on %s;', t);
    -- authenticated = any logged-in team member
    execute format($p$create policy "team read"   on %s for select to authenticated using (true);$p$, t);
    execute format($p$create policy "team write"  on %s for insert to authenticated with check (true);$p$, t);
    execute format($p$create policy "team update" on %s for update to authenticated using (true);$p$, t);
    execute format($p$create policy "team delete" on %s for delete to authenticated using (true);$p$, t);
  end loop;
end $$;

-- ============================================================
--  DONE. Next steps (outside SQL):
--  1. Authentication → Providers → Email: enable, turn OFF
--     "Confirm email" so you can add teammates instantly.
--  2. Authentication → Users → Add user: create up to 5 logins
--     (email + password) for your team.
-- ============================================================
