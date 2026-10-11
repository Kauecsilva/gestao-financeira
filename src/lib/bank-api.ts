// Chamadas do navegador para as rotas /api/bancos, com o login do Supabase.

import { supabase } from "./store";
import type { AccountType } from "./types";

export interface BankConnectionView {
  id: string;
  item_id: string;
  name: string;
  last_synced_at: string | null;
}

export interface PreviewAccount {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
}

export interface Preview {
  name: string;
  lastUpdatedAt: string | null;
  accounts: PreviewAccount[];
}

export interface SyncSummary {
  synced: number;
  accounts: number;
  imported: number;
  errors: string[];
}

export function bankApi<T>(path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: unknown): Promise<T> {
  return api<T>(`/api/bancos${path}`, method, body);
}

/** Token para abrir o Pluggy Connect (a janela da Pluggy onde você entra no banco). */
export async function connectToken(): Promise<string> {
  return (await api<{ accessToken: string }>("/api/connect-token", "POST", {})).accessToken;
}

async function api<T>(url: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const { data } = (await supabase()?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
  return json;
}
