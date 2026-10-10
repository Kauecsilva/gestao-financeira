-- Carteira de investimentos. Valores em centavos.

create table public.investments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null check (kind in ('fixed_income', 'treasury', 'stocks', 'reits', 'crypto', 'pension', 'other')),
  institution text not null default '',
  invested_amount bigint not null default 0 check (invested_amount >= 0),
  current_amount bigint not null default 0 check (current_amount >= 0),
  purpose text not null check (purpose in ('emergency', 'short_term', 'long_term')),
  liquidity text not null check (liquidity in ('daily', 'at_maturity', 'other')),
  maturity_date date,
  created_at timestamptz not null default now()
);

alter table public.investments enable row level security;
create policy "dono acessa" on public.investments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index on public.investments (user_id);
