import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FinanceData, RowOf, TableName } from "./types";

// Onde os dados ficam. Com as variáveis do Supabase definidas, no banco (sincroniza
// celular e PC). Sem elas, no navegador (modo local, bom para testar).

export interface Store {
  mode: "supabase" | "local";
  loadAll(): Promise<FinanceData>;
  upsert<T extends TableName>(table: T, row: RowOf<T>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
}

export const TABLES: TableName[] = ["accounts", "transactions", "recurring", "installments", "investments"];

const emptyData = (): FinanceData => ({ accounts: [], transactions: [], recurring: [], installments: [], investments: [] });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  client ??= createClient(url, anonKey);
  return client;
}

// O banco preenche user_id e created_at; não mandamos esses campos.
function stripServerFields<T extends object>(row: T): T {
  const copy = { ...row } as Record<string, unknown>;
  delete copy.created_at;
  delete copy.user_id;
  return copy as T;
}

function supabaseStore(db: SupabaseClient): Store {
  return {
    mode: "supabase",
    async loadAll() {
      const results = await Promise.all(
        TABLES.map((t) => db.from(t).select("*").order("created_at", { ascending: true })),
      );
      const data = emptyData();
      results.forEach((res, i) => {
        if (res.error) throw res.error;
        (data[TABLES[i]] as unknown[]) = res.data ?? [];
      });
      return data;
    },
    async upsert(table, row) {
      const { error } = await db.from(table).upsert(stripServerFields(row));
      if (error) throw error;
    },
    async remove(table, id) {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

const LOCAL_KEY = "gestao-financeira:v1";

function localStore(): Store {
  const read = (): FinanceData => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? { ...emptyData(), ...JSON.parse(raw) } : emptyData();
    } catch {
      return emptyData();
    }
  };
  const write = (data: FinanceData) => localStorage.setItem(LOCAL_KEY, JSON.stringify(data));

  return {
    mode: "local",
    async loadAll() {
      return read();
    },
    async upsert(table, row) {
      const data = read();
      const rows = data[table] as RowOf<typeof table>[];
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0) rows[i] = row;
      else rows.push({ ...row, created_at: new Date().toISOString() });
      write(data);
    },
    async remove(table, id) {
      const data = read();
      (data[table] as { id: string }[]) = data[table].filter((r) => r.id !== id);
      write(data);
    },
  };
}

export function createStore(): Store {
  const db = supabase();
  return db ? supabaseStore(db) : localStore();
}
