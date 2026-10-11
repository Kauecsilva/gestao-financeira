-- Conexão com bancos (Open Finance via Pluggy).
-- Cada conexão é um "item" da Pluggy (um banco). As contas e lançamentos trazidos de lá guardam o
-- id da Pluggy em external_id, para não duplicar quando sincronizar de novo.

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id text not null,
  name text not null default '',
  -- Contas da Pluggy que o usuário escolheu não trazer.
  ignored_accounts text[] not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.bank_connections enable row level security;
create policy "dono acessa" on public.bank_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.accounts
  add column external_id text,
  -- Lançamentos do banco são importados a partir desta data.
  add column synced_since date,
  add constraint accounts_external_id_key unique (user_id, external_id);

alter table public.transactions
  add column external_id text,
  add constraint transactions_external_id_key unique (user_id, external_id);
