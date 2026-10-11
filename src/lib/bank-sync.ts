// Converte o que vem da Pluggy (Open Finance) para as contas e lançamentos do app.
// Só funções puras aqui; quem fala com a Pluggy e com o banco é src/lib/pluggy.ts.

import type { AccountType, Kind } from "./types";

export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: "CHECKING_ACCOUNT" | "SAVINGS_ACCOUNT" | "CREDIT_CARD";
  name: string;
  marketingName: string | null;
  number: string;
  /** Em reais. No cartão, é a fatura em aberto. */
  balance: number;
  creditData: { balanceCloseDate: string | null; balanceDueDate: string | null } | null;
}

export interface PluggyTransaction {
  id: string;
  /** ISO, ex.: "2026-10-05T03:00:00.000Z". */
  date: string;
  description: string;
  descriptionRaw: string | null;
  type: "DEBIT" | "CREDIT";
  amount: number;
  amountInAccountCurrency: number | null;
  category: string | null;
  status?: "PENDING" | "POSTED";
}

export const toCents = (reais: number) => Math.round(reais * 100);

export function accountTypeOf(a: Pick<PluggyAccount, "type" | "subtype">): AccountType {
  if (a.type === "CREDIT") return "credit_card";
  return a.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking";
}

/** Nome sugerido para a conta nova, ex.: "Nubank · Conta corrente", "Cartão Nubank •1234". */
export function accountName(connector: string, a: PluggyAccount): string {
  const label = (a.marketingName || a.name || "").trim();
  if (a.type === "CREDIT") {
    const last = a.number?.replace(/\D/g, "").slice(-4);
    return `Cartão ${connector}${last ? ` •${last}` : ""}`;
  }
  return label ? `${connector} · ${label}` : connector;
}

/** Dia do mês de uma data ISO da Pluggy, no fuso de Brasília. */
function dayOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = Number(isoToLocalDate(iso).slice(8, 10));
  return d >= 1 && d <= 31 ? d : null;
}

export function cardDays(a: PluggyAccount): { closing_day: number | null; due_day: number | null } {
  return { closing_day: dayOf(a.creditData?.balanceCloseDate), due_day: dayOf(a.creditData?.balanceDueDate) };
}

const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * "YYYY-MM-DD" de uma data da Pluggy. Datas sem horário vêm à meia-noite UTC e ficam como estão;
 * as com horário são convertidas para Brasília (uma compra às 23h não vira o dia seguinte).
 */
export function isoToLocalDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) || /T00:00:00(\.0+)?Z$/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : brDate.format(d);
}

// Categorias da Pluggy (em inglês) → categorias do app. A primeira regra que bater vale.
const CATEGORY_RULES: [RegExp, string][] = [
  [/salary|retirement|government aid|wage/i, "Salário"],
  [/groceries|supermarket/i, "Mercado"],
  [/eating out|food|restaurant|bakery|bar\b/i, "Alimentação"],
  [/transport|taxi|ride|car rental|bicycle|automotive|gas station|fuel|parking|toll|vehicle(?! insurance)/i, "Transporte"],
  [/streaming|digital service|subscription|software/i, "Assinaturas"],
  [/health|dentist|pharmac|optometr|hospital|clinic|lab|gym|fitness|wellness/i, "Saúde"],
  [/education|course|universit|school|bookstore/i, "Educação"],
  [/housing|rent|condominium|utilities|water|electricity|\bgas\b|home/i, "Moradia"],
  [/telecom|internet|mobile|\btv\b|tax|\bfees?\b|insurance|legal|interest|late payment/i, "Contas"],
  [/leisure|travel|ticket|entertainment|gambling|lotter|accommodation|airport|airline|stadium|games/i, "Lazer"],
  [/shopping|clothing|electronics|pet|kids|toys|department store|houseware/i, "Compras"],
];

export function categoryOf(pluggyCategory: string | null): string {
  if (!pluggyCategory) return "Outros";
  return CATEGORY_RULES.find(([re]) => re.test(pluggyCategory))?.[1] ?? "Outros";
}

/**
 * Movimentos entre as próprias contas (pagar a fatura, transferir para si mesmo) não são gasto nem
 * receita: o saldo das duas pontas já vem certo do banco. Importar contaria o gasto em dobro.
 */
export function isInternalMovement(pluggyCategory: string | null, description = ""): boolean {
  // Nem todo banco manda a categoria; a descrição do pagamento da fatura também denuncia.
  return (
    (!!pluggyCategory && /credit card payment|same person transfer|same ownership/i.test(pluggyCategory)) ||
    /^\s*(pagamento (de|da) fatura|pgto\.? (de )?fatura|pagamento recebido)/i.test(description)
  );
}

export interface ImportedTransaction {
  external_id: string;
  kind: Kind;
  amount: number;
  category: string;
  description: string;
  date: string;
}

/** O lançamento como fica no app, ou null quando não deve ser importado. */
export function toTransaction(t: PluggyTransaction): ImportedTransaction | null {
  const description = (t.description || t.descriptionRaw || "").trim().slice(0, 200);
  if (t.status === "PENDING" || isInternalMovement(t.category, description)) return null;
  const amount = Math.abs(toCents(t.amountInAccountCurrency ?? t.amount));
  if (amount === 0) return null;
  const kind: Kind = t.type === "CREDIT" ? "income" : "expense";
  return {
    external_id: t.id,
    kind,
    amount,
    // Entrada só é Salário ou Outros: rendimento e estorno não são "Contas" nem "Compras".
    category: kind === "income" ? (categoryOf(t.category) === "Salário" ? "Salário" : "Outros") : categoryOf(t.category),
    description,
    date: isoToLocalDate(t.date),
  };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Desde quando buscar lançamentos de uma conta: desde a última sincronização (com 10 dias de folga,
 * porque o banco às vezes publica com atraso), nunca antes de `synced_since`.
 */
export function syncFrom(syncedSince: string, lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return syncedSince;
  const margin = new Date(new Date(lastSyncedAt).getTime() - 10 * DAY).toISOString().slice(0, 10);
  return margin > syncedSince ? margin : syncedSince;
}

/** Quantos dias de histórico trazer numa conta nova. */
export const HISTORY_DAYS = 90;
