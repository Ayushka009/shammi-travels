-- Run once in Supabase → SQL Editor.
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, email text, address text,
  created_at timestamptz default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('invoice','quotation','agreement')),
  number text not null unique,
  customer_id uuid references customers(id) on delete restrict,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft',
  items jsonb not null default '[]',
  tax_rate numeric not null default 0,
  total numeric not null default 0,
  notes text,
  data jsonb not null default '{}',   -- agreement fields (route, vehicle, terms...)
  created_at timestamptz default now()
);

-- Only signed-in users can touch anything. Disable public sign-ups in
-- Authentication → Providers → Email so only users you create can sign in.
create table settings (   -- single row: business details printed on documents
  id int primary key default 1 check (id = 1),
  name text, address text, phone text, email text, signatory text,
  bank text,               -- one line per row, printed on invoices/agreements
  subsidiary text,         -- e.g. "A subsidiary of …", printed in document headers
  pv text,                 -- company PV number, printed in headers and agreements
  terms text               -- standard agreement terms (see Settings page for the format)
);
insert into settings (id, name) values (1, 'Shammi Travels');

alter table settings enable row level security;
alter table customers enable row level security;
alter table documents enable row level security;
create policy "auth only" on settings for all to authenticated using (true) with check (true);
create policy "auth only" on customers for all to authenticated using (true) with check (true);
create policy "auth only" on documents for all to authenticated using (true) with check (true);

-- Service providers: suppliers we hire vehicles from, and the rates they charge us
create table service_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text, email text, notes text,
  created_at timestamptz default now()
);
create table provider_rates (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references service_providers(id) on delete cascade,
  vehicle text not null,
  hours numeric,            -- hourly package length (empty for per-km pricing)
  included_km numeric,      -- km covered by the rate
  rate numeric not null check (rate >= 0),
  extra_km_rate numeric,    -- charged per km beyond included_km
  notes text,
  created_at timestamptz default now()
);
alter table service_providers enable row level security;
alter table provider_rates enable row level security;
create policy "auth only" on service_providers for all to authenticated using (true) with check (true);
create policy "auth only" on provider_rates for all to authenticated using (true) with check (true);
