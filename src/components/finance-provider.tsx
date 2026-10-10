"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { balanceDelta } from "@/lib/finance";
import { createStore, supabase, type Store } from "@/lib/store";
import type { Account, FinanceData, RowOf, TableName, Transaction } from "@/lib/types";
import { LoginForm } from "./login-form";

interface FinanceContext {
  data: FinanceData;
  mode: Store["mode"];
  error: string | null;
  save<T extends TableName>(table: T, row: RowOf<T>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Registra o lançamento e ajusta o saldo da conta. */
  addTransaction(t: Transaction): Promise<void>;
  /** Apaga o lançamento e desfaz o ajuste no saldo. */
  deleteTransaction(t: Transaction): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<FinanceContext | null>(null);

export function useFinance(): FinanceContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFinance fora do FinanceProvider");
  return ctx;
}

const empty: FinanceData = { accounts: [], transactions: [], recurring: [], installments: [], investments: [] };

function upsertIn<T extends { id: string }>(rows: T[], row: T): T[] {
  const i = rows.findIndex((r) => r.id === row.id);
  return i >= 0 ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createStore);
  const [session, setSession] = useState<Session | null | undefined>(
    store.mode === "local" ? null : undefined,
  );
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cópia sempre atualizada dos dados, para ajustes de saldo seguidos não usarem valor velho.
  const latest = useRef<FinanceData>(empty);

  const replaceData = useCallback((next: FinanceData | null) => {
    latest.current = next ?? empty;
    setData(next);
  }, []);

  const needsLogin = store.mode === "supabase" && !session;

  useEffect(() => {
    const db = supabase();
    if (!db) return;
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    try {
      replaceData(await store.loadAll());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [store, replaceData]);

  useEffect(() => {
    if (session === undefined || needsLogin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial dos dados
    void reload();
  }, [session, needsLogin, reload]);

  // Atualiza a tela na hora e grava em seguida; se a gravação falhar, recarrega do banco.
  const persist = useCallback(
    async (apply: (d: FinanceData) => FinanceData, write: () => Promise<void>) => {
      replaceData(apply(latest.current));
      try {
        await write();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        await reload();
      }
    },
    [reload, replaceData],
  );

  const ctx = useMemo<FinanceContext>(() => {
    const save: FinanceContext["save"] = (table, row) =>
      persist(
        (cur) => ({ ...cur, [table]: upsertIn(cur[table] as { id: string }[], row) }),
        () => store.upsert(table, row),
      );

    const remove: FinanceContext["remove"] = (table, id) =>
      persist(
        (cur) => {
          const next = { ...cur, [table]: (cur[table] as { id: string }[]).filter((r) => r.id !== id) };
          if (table !== "accounts") return next;
          // Apagar a conta apaga o que depende dela (o banco faz o mesmo em cascata).
          return {
            accounts: next.accounts,
            transactions: next.transactions.filter((r) => r.account_id !== id),
            recurring: next.recurring.filter((r) => r.account_id !== id),
            installments: next.installments.filter((r) => r.account_id !== id),
            investments: next.investments,
          };
        },
        () => store.remove(table, id),
      );

    const adjust = (account: Account, delta: number): Account => ({ ...account, balance: account.balance + delta });

    const addTransaction = async (t: Transaction) => {
      const account = latest.current.accounts.find((a) => a.id === t.account_id);
      if (!account) return;
      const updated = adjust(account, balanceDelta(account, t.kind, t.amount));
      await persist(
        (cur) => ({
          ...cur,
          transactions: upsertIn(cur.transactions, t),
          accounts: upsertIn(cur.accounts, updated),
        }),
        async () => {
          await store.upsert("transactions", t);
          await store.upsert("accounts", updated);
        },
      );
    };

    const deleteTransaction = async (t: Transaction) => {
      const account = latest.current.accounts.find((a) => a.id === t.account_id);
      const updated = account && adjust(account, -balanceDelta(account, t.kind, t.amount));
      await persist(
        (cur) => ({
          ...cur,
          transactions: cur.transactions.filter((r) => r.id !== t.id),
          accounts: updated ? upsertIn(cur.accounts, updated) : cur.accounts,
        }),
        async () => {
          await store.remove("transactions", t.id);
          if (updated) await store.upsert("accounts", updated);
        },
      );
    };

    return {
      data: data ?? empty,
      mode: store.mode,
      error,
      save,
      remove,
      addTransaction,
      deleteTransaction,
      signOut: async () => {
        await supabase()?.auth.signOut();
        replaceData(null);
      },
    };
  }, [data, error, persist, store, replaceData]);

  if (session === undefined) return <FullScreenMessage text="Carregando…" />;
  if (needsLogin) return <LoginForm />;
  if (!data) return <FullScreenMessage text={error ?? "Carregando seus dados…"} />;
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

function FullScreenMessage({ text }: { text: string }) {
  return <div className="flex min-h-dvh items-center justify-center p-6 text-muted">{text}</div>;
}
