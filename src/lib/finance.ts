import { addMonths, dateInMonth, endOfMonth, monthKey, parts } from "./dates";
import type { Account, FinanceData, Installment, Kind, Recurring } from "./types";

// Regras de cálculo do painel. Tudo aqui é puro (sem I/O) e coberto por testes.
//
// Convenção: compromissos com data anterior a hoje já foram pagos e estão refletidos
// nos saldos; os de hoje em diante ainda vão sair.

export type ScheduledSource = "recurring" | "installment" | "recharge" | "card_bill";

export interface ScheduledItem {
  date: string;
  kind: Kind;
  amount: number;
  description: string;
  category: string;
  account_id: string;
  source: ScheduledSource;
  source_id: string;
  /** Só para parcelas: número da parcela e total. */
  installment?: { n: number; of: number };
}

const CASH_TYPES = new Set<Account["type"]>(["checking", "savings", "cash"]);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function monthsBetween(from: string, to: string): { y: number; m: number }[] {
  const a = parts(from);
  const b = parts(to);
  const out: { y: number; m: number }[] = [];
  const count = (b.y - a.y) * 12 + (b.m - a.m);
  for (let i = 0; i <= count; i++) out.push(addMonths(a.y, a.m, i));
  return out;
}

export function recurringOccurrences(r: Recurring, from: string, to: string): string[] {
  const lo = r.start_date > from ? r.start_date : from;
  const hi = r.end_date && r.end_date < to ? r.end_date : to;
  if (lo > hi) return [];
  return monthsBetween(lo, hi)
    .map(({ y, m }) => dateInMonth(y, m, r.day_of_month))
    .filter((d) => d >= lo && d <= hi);
}

export interface InstallmentParcel {
  n: number;
  date: string;
  amount: number;
}

/** Divide o total em parcelas; a diferença de centavos vai na primeira. */
export function installmentSchedule(inst: Installment): InstallmentParcel[] {
  const count = Math.max(1, inst.installments_count);
  const base = Math.floor(inst.total_amount / count);
  const rest = inst.total_amount - base * count;
  const first = parts(inst.first_date);
  return Array.from({ length: count }, (_, i) => {
    const { y, m } = addMonths(first.y, first.m, i);
    return { n: i + 1, date: dateInMonth(y, m, first.d), amount: base + (i === 0 ? rest : 0) };
  });
}

type CardWithDays = Account & { closing_day: number; due_day: number };

/** Cartão com dia de fechamento e de vencimento cadastrados. */
export function hasBillingDays(a: Account | undefined): a is CardWithDays {
  return a?.type === "credit_card" && !!a.closing_day && !!a.due_day;
}

/** Vencimento da fatura em que cai uma compra feita em `date`. Compra no dia do fechamento já vai para a próxima. */
export function invoiceDueDate(card: CardWithDays, date: string): string {
  const { y, m } = parts(date);
  const closesThisMonth = date < dateInMonth(y, m, card.closing_day);
  const closing = closesThisMonth ? { y, m } : addMonths(y, m, 1);
  // Vencimento depois do fechamento no mesmo mês; senão, no mês seguinte ao fechamento.
  const due = card.due_day > card.closing_day ? closing : addMonths(closing.y, closing.m, 1);
  return dateInMonth(due.y, due.m, card.due_day);
}

/** Próximo vencimento do cartão a partir de `today` (inclusive). */
export function nextDueDate(card: CardWithDays, today: string): string {
  const { y, m } = parts(today);
  const thisMonth = dateInMonth(y, m, card.due_day);
  if (thisMonth >= today) return thisMonth;
  const next = addMonths(y, m, 1);
  return dateInMonth(next.y, next.m, card.due_day);
}

export interface CardInvoice {
  due: string;
  amount: number;
}

/**
 * Divide a fatura em aberto do cartão pelos vencimentos. Compras lançadas que caem em faturas
 * depois da próxima vão para elas; o resto do saldo (inclusive o que foi digitado na conta) é
 * a próxima fatura.
 */
export function cardInvoices(data: FinanceData, card: CardWithDays, today: string): CardInvoice[] {
  const next = nextDueDate(card, today);
  const later = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.account_id !== card.id) continue;
    const due = invoiceDueDate(card, t.date);
    if (due <= next) continue;
    later.set(due, (later.get(due) ?? 0) + balanceDelta(card, t.kind, t.amount));
  }
  const laterTotal = sum([...later.values()]);
  return [
    { due: next, amount: card.balance - laterTotal },
    ...[...later].sort(([a], [b]) => (a < b ? -1 : 1)).map(([due, amount]) => ({ due, amount })),
  ].filter((i) => i.amount !== 0);
}

/**
 * Tudo o que está previsto entre `from` e `to` (inclusive), em ordem de data.
 *
 * Fixos e parcelas no cartão de crédito saem do dinheiro no vencimento da fatura, não na data
 * da compra. `since` é desde quando contar compras ainda não feitas (as anteriores já estão na
 * fatura em aberto); por padrão, `from`.
 */
export function scheduled(data: FinanceData, from: string, to: string, since = from): ScheduledItem[] {
  const items: ScheduledItem[] = [];
  const accounts = accountIndex(data);
  /** Data em que o item sai do dinheiro, ou null se cai fora do período. */
  const payDate = (accountId: string, date: string): string | null => {
    const card = accounts.get(accountId);
    const pay = hasBillingDays(card) ? invoiceDueDate(card, date) : date;
    return date >= since && pay >= from && pay <= to ? pay : null;
  };

  for (const r of data.recurring) {
    for (const occurrence of recurringOccurrences(r, since, to)) {
      const date = payDate(r.account_id, occurrence);
      if (!date) continue;
      items.push({
        date,
        kind: r.kind,
        amount: r.amount,
        description: r.description,
        category: r.category,
        account_id: r.account_id,
        source: "recurring",
        source_id: r.id,
      });
    }
  }

  for (const inst of data.installments) {
    for (const p of installmentSchedule(inst)) {
      const date = payDate(inst.account_id, p.date);
      if (!date) continue;
      items.push({
        date,
        kind: "expense",
        amount: p.amount,
        description: inst.description,
        category: inst.category,
        account_id: inst.account_id,
        source: "installment",
        source_id: inst.id,
        installment: { n: p.n, of: inst.installments_count },
      });
    }
  }

  for (const a of data.accounts) {
    if (a.type !== "benefit" || !a.monthly_recharge || !a.recharge_day) continue;
    for (const { y, m } of monthsBetween(from, to)) {
      const date = dateInMonth(y, m, a.recharge_day);
      if (date < from || date > to) continue;
      items.push({
        date,
        kind: "income",
        amount: a.monthly_recharge,
        description: `Recarga ${a.name}`,
        category: "Benefício",
        account_id: a.id,
        source: "recharge",
        source_id: a.id,
      });
    }
  }

  for (const card of data.accounts) {
    if (!hasBillingDays(card)) continue;
    for (const inv of cardInvoices(data, card, since)) {
      if (inv.amount <= 0 || inv.due < from || inv.due > to) continue;
      items.push({
        date: inv.due,
        kind: "expense",
        amount: inv.amount,
        description: `Fatura ${card.name}`,
        category: "Cartão",
        account_id: card.id,
        source: "card_bill",
        source_id: card.id,
      });
    }
  }

  return items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

function accountIndex(data: FinanceData): Map<string, Account> {
  return new Map(data.accounts.map((a) => [a.id, a]));
}

/** Item que mexe no dinheiro livre (não em benefício). */
function isCashItem(item: ScheduledItem, accounts: Map<string, Account>): boolean {
  return accounts.get(item.account_id)?.type !== "benefit";
}

export interface Summary {
  /** Corrente + poupança + dinheiro. */
  available: number;
  /** Saldo somado de VR, VA etc. */
  benefits: number;
  /** Faturas de cartão em aberto (todas, não só as que vencem no mês). */
  cardBills: number;
  /** Faturas que vencem até o fim do mês (cartão sem vencimento cadastrado conta inteiro). */
  cardBillsDue: number;
  /** Receitas previstas de hoje até o fim do mês (fora benefícios). */
  expectedIncome: number;
  /** Recorrências, parcelas e faturas de hoje até o fim do mês. */
  committed: number;
  /** O que dá para gastar no mês sem mexer em nada comprometido. */
  free: number;
  /** Gastos previstos no mês pagos com benefício. */
  benefitsCommitted: number;
  upcoming: ScheduledItem[];
}

export function summary(data: FinanceData, today: string): Summary {
  const accounts = accountIndex(data);
  const balanceOf = (pred: (a: Account) => boolean) =>
    sum(data.accounts.filter(pred).map((a) => a.balance));

  const available = balanceOf((a) => CASH_TYPES.has(a.type));
  const benefits = balanceOf((a) => a.type === "benefit");
  const cardBills = balanceOf((a) => a.type === "credit_card");
  // Cartão sem vencimento cadastrado: a fatura inteira conta como do mês, como antes.
  const undatedBills = balanceOf((a) => a.type === "credit_card" && !hasBillingDays(a));

  const upcoming = scheduled(data, today, endOfMonth(today));
  const cash = upcoming.filter((i) => isCashItem(i, accounts));
  const expectedIncome = sum(cash.filter((i) => i.kind === "income").map((i) => i.amount));
  const committed =
    sum(cash.filter((i) => i.kind === "expense").map((i) => i.amount)) + undatedBills;
  const cardBillsDue = sum(cash.filter((i) => i.source === "card_bill").map((i) => i.amount)) + undatedBills;
  const benefitsCommitted = sum(
    upcoming.filter((i) => !isCashItem(i, accounts) && i.kind === "expense").map((i) => i.amount),
  );

  return {
    available,
    benefits,
    cardBills,
    cardBillsDue,
    expectedIncome,
    committed,
    free: available + expectedIncome - committed,
    benefitsCommitted,
    upcoming,
  };
}

export interface MonthProjection {
  month: string;
  income: number;
  recurringExpenses: number;
  installmentExpenses: number;
  /** Compras no cartão já lançadas que caem em faturas deste mês. */
  cardBillExpenses: number;
  net: number;
  /** Livre acumulado ao fim do mês, partindo do livre do mês atual. */
  projectedFree: number;
}

/** Projeção dos `months` meses seguintes ao atual, só com dinheiro (sem benefícios). */
export function projection(data: FinanceData, today: string, months = 6): MonthProjection[] {
  const accounts = accountIndex(data);
  const { y, m } = parts(today);
  let running = summary(data, today).free;
  const out: MonthProjection[] = [];

  for (let i = 1; i <= months; i++) {
    const next = addMonths(y, m, i);
    const from = dateInMonth(next.y, next.m, 1);
    const items = scheduled(data, from, endOfMonth(from), today).filter((it) => isCashItem(it, accounts));
    const income = sum(items.filter((it) => it.kind === "income").map((it) => it.amount));
    const expensesBy = (source: ScheduledSource) =>
      sum(items.filter((it) => it.kind === "expense" && it.source === source).map((it) => it.amount));
    const recurringExpenses = expensesBy("recurring");
    const installmentExpenses = expensesBy("installment");
    const cardBillExpenses = expensesBy("card_bill");
    const net = income - recurringExpenses - installmentExpenses - cardBillExpenses;
    running += net;
    out.push({
      month: monthKey(from),
      income,
      recurringExpenses,
      installmentExpenses,
      cardBillExpenses,
      net,
      projectedFree: running,
    });
  }
  return out;
}

export interface InstallmentStatus {
  installment: Installment;
  paid: number;
  remaining: number;
  parcelAmount: number;
  remainingAmount: number;
  nextDate: string | null;
  lastDate: string;
}

export function installmentStatus(inst: Installment, today: string): InstallmentStatus {
  const schedule = installmentSchedule(inst);
  const pending = schedule.filter((p) => p.date >= today);
  return {
    installment: inst,
    paid: schedule.length - pending.length,
    remaining: pending.length,
    parcelAmount: schedule[schedule.length - 1].amount,
    remainingAmount: sum(pending.map((p) => p.amount)),
    nextDate: pending[0]?.date ?? null,
    lastDate: schedule[schedule.length - 1].date,
  };
}

/** Parcelamentos ainda com parcelas a vencer, do que termina antes para o que termina depois. */
export function activeInstallments(data: FinanceData, today: string): InstallmentStatus[] {
  return data.installments
    .map((i) => installmentStatus(i, today))
    .filter((s) => s.remaining > 0)
    .sort((a, b) => (a.lastDate < b.lastDate ? -1 : 1));
}

/** Efeito de um lançamento no saldo da conta. Em cartão, gasto aumenta a fatura. */
export function balanceDelta(account: Account, kind: Kind, amount: number): number {
  const sign = kind === "income" ? 1 : -1;
  return account.type === "credit_card" ? -sign * amount : sign * amount;
}

export function spentByCategory(data: FinanceData, month: string): { category: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.kind !== "expense" || monthKey(t.date) !== month) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  return [...totals].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
