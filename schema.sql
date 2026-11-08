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
alter table customers enable row level security;
alter table documents enable row level security;
create policy "auth only" on customers for all to authenticated using (true) with check (true);
create policy "auth only" on documents for all to authenticated using (true) with check (true);
