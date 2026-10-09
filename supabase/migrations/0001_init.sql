-- Gestão Financeira: tabelas do MVP.
-- Valores em centavos (bigint). Cada linha pertence a um usuário e só ele a vê (RLS).

create table public.accounts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  type text not null check (type in ('checking', 'savings', 'cash', 'credit_card', 'benefit')),
  balance bigint not null default 0,
  monthly_recharge bigint,
  recharge_day smallint check (recharge_day between 1 and 31),
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount bigint not null check (amount >= 0),
  category text not null,
  description text not null default '',
  date date not null,
  created_at timestamptz not null default now()
);

create table public.recurring (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount bigint not null check (amount >= 0),
  category text not null,
  description text not null default '',
  day_of_month smallint not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.installments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  description text not null,
  category text not null,
  total_amount bigint not null check (total_amount >= 0),
  installments_count smallint not null check (installments_count >= 1),
  first_date date not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['accounts', 'transactions', 'recurring', 'installments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono acessa" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create index on public.%I (user_id)', t);
  end loop;
end $$;
