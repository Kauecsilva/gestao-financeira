-- Cartão de crédito: dia de fechamento e de vencimento da fatura.

alter table public.accounts
  add column closing_day smallint check (closing_day between 1 and 31),
  add column due_day smallint check (due_day between 1 and 31);
