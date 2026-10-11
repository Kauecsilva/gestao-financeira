// Acha nos lançamentos (em especial os que vieram do banco) cobranças que se repetem todo mês,
// como Netflix, Spotify e academia, para sugerir cadastrá-las como compromissos fixos.

import { addMonths, dateInMonth, monthKey, parts } from "./dates";
import type { FinanceData, Recurring, Transaction } from "./types";

export interface SubscriptionSuggestion {
  key: string;
  description: string;
  account_id: string;
  category: string;
  /** Valor da última cobrança. */
  amount: number;
  day_of_month: number;
  last_date: string;
  /** Em quantos meses seguidos apareceu. */
  months: number;
}

/** "Compra no débito|NETFLIX.COM" → "NETFLIX.COM". O banco põe o tipo antes da barra. */
export function cleanDescription(description: string): string {
  const parts = description.split("|").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : (parts[0] ?? "");
}

/** Chave para juntar cobranças do mesmo serviço: sem números, pontuação e prefixos de meio de pagamento. */
export function subscriptionKey(description: string): string {
  return cleanDescription(description)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(ebn|dl|pg|pag|ec|mp|pp|iz|sumup|ifd|ino)\s*\*\s*/, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

// Descrições genéricas (transferências, pagamento da fatura) não dizem o que é; não sugerimos.
const GENERIC = /^(transferencia|pix|ted|doc|pagamento de fatura|pagamento recebido|saque|deposito|remuneracao)/;

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Distância entre dois dias do mês, contando a virada (dia 30 e dia 2 estão a 3 dias). */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 31 - d);
}

function alreadyRegistered(key: string, recurring: Recurring[]): boolean {
  return recurring.some((r) => {
    const k = subscriptionKey(r.description);
    return k !== "" && (k === key || k.includes(key) || key.includes(k));
  });
}

/**
 * Uma cobrança é assinatura quando aparece uma vez por mês, em pelo menos 2 meses, com valor
 * parecido (até 35% de diferença) e mais ou menos no mesmo dia (até 7 dias), e a última foi
 * nos últimos 45 dias. Lançamentos já categorizados como Assinaturas bastam aparecer uma vez no
 * último mês.
 */
export function detectSubscriptions(data: FinanceData, today: string): SubscriptionSuggestion[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (t.kind !== "expense" || t.date > today || daysBetween(t.date, today) > 200) continue;
    const key = subscriptionKey(t.description);
    if (key.length < 3 || GENERIC.test(key)) continue;
    const id = `${t.account_id}:${key}`;
    groups.set(id, [...(groups.get(id) ?? []), t]);
  }

  const out: SubscriptionSuggestion[] = [];
  for (const [id, txs] of groups) {
    const key = id.slice(id.indexOf(":") + 1);
    if (alreadyRegistered(key, data.recurring)) continue;
    txs.sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = txs[txs.length - 1];
    const months = new Set(txs.map((t) => monthKey(t.date))).size;
    const recent = daysBetween(last.date, today);

    const amounts = txs.map((t) => t.amount);
    const steadyAmount = Math.max(...amounts) <= Math.min(...amounts) * 1.35;
    const days = txs.map((t) => parts(t.date).d);
    const steadyDay = days.every((d) => dayDistance(d, days[0]) <= 7);
    const monthly = months >= 2 && txs.length === months && steadyAmount && steadyDay && recent <= 45;
    const taggedRecent = last.category === "Assinaturas" && recent <= 35;
    if (!monthly && !taggedRecent) continue;

    out.push({
      key: id,
      description: cleanDescription(last.description),
      account_id: last.account_id,
      category: ["Compras", "Outros"].includes(last.category) ? "Assinaturas" : last.category,
      amount: last.amount,
      day_of_month: parts(last.date).d,
      last_date: last.date,
      months,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/**
 * O compromisso fixo de uma sugestão. Começa na próxima cobrança, para a que já aconteceu (e já
 * está nos lançamentos) não contar de novo.
 */
export function toRecurring(s: SubscriptionSuggestion, id: string): Recurring {
  const { y, m } = parts(s.last_date);
  const next = addMonths(y, m, 1);
  return {
    id,
    account_id: s.account_id,
    kind: "expense",
    amount: s.amount,
    category: s.category,
    description: s.description,
    day_of_month: s.day_of_month,
    start_date: dateInMonth(next.y, next.m, s.day_of_month),
    end_date: null,
  };
}
