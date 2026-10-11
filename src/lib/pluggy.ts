// Só no servidor: fala com a API da Pluggy e grava contas e lançamentos no Supabase.
// As chaves PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nunca vão para o navegador.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toISODate } from "./dates";
import {
  HISTORY_DAYS,
  accountName,
  accountTypeOf,
  cardDays,
  syncFrom,
  toCents,
  toTransaction,
  type PluggyAccount,
  type PluggyTransaction,
} from "./bank-sync";

const API = "https://api.pluggy.ai";

export class PluggyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const pluggyConfigured = () => !!process.env.PLUGGY_CLIENT_ID && !!process.env.PLUGGY_CLIENT_SECRET;

// A chave da API vale 2 horas; guardamos por 1h50 entre chamadas da mesma instância.
let cachedKey: { value: Promise<string>; until: number } | null = null;

function apiKey(): Promise<string> {
  if (cachedKey && cachedKey.until > Date.now()) return cachedKey.value;
  const value = requestKey();
  cachedKey = { value, until: Date.now() + 110 * 60 * 1000 };
  value.catch(() => (cachedKey = null));
  return value;
}

async function requestKey(): Promise<string> {
  const res = await fetch(`${API}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
    cache: "no-store",
  });
  if (!res.ok) throw new PluggyError("As chaves da Pluggy (PLUGGY_CLIENT_ID/SECRET) foram recusadas.", 502);
  return ((await res.json()) as { apiKey: string }).apiKey;
}

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  const res = await fetch(`${API}/${path}${qs.size ? `?${qs}` : ""}`, {
    headers: { "X-API-KEY": await apiKey() },
    cache: "no-store",
  });
  if (res.status === 404) throw new PluggyError("Conexão não encontrada na Pluggy. Confira o Item ID.", 404);
  if (!res.ok) throw new PluggyError(`A Pluggy respondeu com erro (${res.status}).`, 502);
  return (await res.json()) as T;
}

export interface PluggyItem {
  id: string;
  connector: { name: string };
  status: string;
  lastUpdatedAt: string | null;
}

export const fetchItem = (itemId: string) => get<PluggyItem>(`items/${encodeURIComponent(itemId)}`);

export async function fetchAccounts(itemId: string): Promise<PluggyAccount[]> {
  return (await get<{ results: PluggyAccount[] }>("accounts", { itemId })).results;
}

async function fetchTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
  const all: PluggyTransaction[] = [];
  let after: string | undefined;
  do {
    const page = await get<{ results: PluggyTransaction[]; next: string | null }>("v2/transactions", { accountId, dateFrom, after });
    all.push(...page.results);
    after = page.next ? (new URL(page.next, API).searchParams.get("after") ?? undefined) : undefined;
  } while (after);
  return all;
}

export interface BankConnection {
  id: string;
  item_id: string;
  name: string;
  ignored_accounts: string[];
  last_synced_at: string | null;
}

/** Para cada conta da Pluggy: id de uma conta do app para ligar, "new" para criar ou "skip" para ignorar. */
export type Links = Record<string, string>;

export interface SyncResult {
  accounts: number;
  imported: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

/**
 * Atualiza o saldo das contas desta conexão e importa os lançamentos novos. Roda com o cliente do
 * Supabase do próprio usuário, então as regras de acesso (RLS) valem como no app.
 * `links` só vem na primeira vez, quando o usuário escolhe o que fazer com cada conta.
 */
export async function syncConnection(db: SupabaseClient, conn: BankConnection, links: Links = {}): Promise<SyncResult> {
  const [item, remote] = await Promise.all([fetchItem(conn.item_id), fetchAccounts(conn.item_id)]);
  const ignored = new Set(conn.ignored_accounts);
  for (const [pluggyId, choice] of Object.entries(links)) if (choice === "skip") ignored.add(pluggyId);

  const { data: local, error } = await db
    .from("accounts")
    .select("id, external_id, synced_since, closing_day, due_day")
    .in("external_id", remote.map((a) => a.id));
  if (error) throw error;
  const byExternal = new Map(local.map((a) => [a.external_id as string, a]));

  const result: SyncResult = { accounts: 0, imported: 0 };
  for (const acc of remote) {
    if (ignored.has(acc.id)) continue;
    const balance = toCents(acc.balance);
    const isCard = acc.type === "CREDIT";
    const days = isCard ? cardDays(acc) : null;
    let target = byExternal.get(acc.id);

    if (target) {
      const { error } = await db
        .from("accounts")
        .update({
          balance,
          // Não sobrescreve dias que o usuário já cadastrou.
          ...(days && !target.closing_day && days.closing_day ? { closing_day: days.closing_day } : {}),
          ...(days && !target.due_day && days.due_day ? { due_day: days.due_day } : {}),
        })
        .eq("id", target.id);
      if (error) throw error;
    } else if (links[acc.id] && links[acc.id] !== "new") {
      // Liga a uma conta que já existia no app. O histórico dela foi digitado à mão, então só
      // importa lançamentos de hoje em diante para não duplicar.
      const synced_since = toISODate(new Date());
      const { data, error } = await db
        .from("accounts")
        .update({ external_id: acc.id, synced_since, balance })
        .eq("id", links[acc.id])
        .select("id, external_id, synced_since, closing_day, due_day")
        .single();
      if (error) throw error;
      target = data;
    } else {
      const { data, error } = await db
        .from("accounts")
        .insert({
          id: crypto.randomUUID(),
          name: accountName(item.connector.name, acc),
          type: accountTypeOf(acc),
          balance,
          external_id: acc.id,
          synced_since: daysAgo(HISTORY_DAYS),
          ...(days ?? {}),
        })
        .select("id, external_id, synced_since, closing_day, due_day")
        .single();
      if (error) throw error;
      target = data;
    }
    result.accounts++;

    const from = syncFrom(target!.synced_since ?? daysAgo(HISTORY_DAYS), conn.last_synced_at);
    const rows = (await fetchTransactions(acc.id, from))
      .map(toTransaction)
      .filter((t) => t !== null && t.date >= from)
      .map((t) => ({ ...t!, id: crypto.randomUUID(), account_id: target!.id }));
    if (rows.length) {
      // Os que já foram importados ficam como estão (o usuário pode ter mudado a categoria).
      const { data, error } = await db
        .from("transactions")
        .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      result.imported += data.length;
    }
  }

  const { error: updateError } = await db
    .from("bank_connections")
    .update({ name: item.connector.name, ignored_accounts: [...ignored], last_synced_at: new Date().toISOString() })
    .eq("id", conn.id);
  if (updateError) throw updateError;
  return result;
}
