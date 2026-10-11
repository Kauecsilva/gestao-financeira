"use client";

import { useCallback, useEffect, useState } from "react";
import { bankApi, connectToken, type BankConnectionView, type Preview, type SyncSummary } from "@/lib/bank-api";
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from "@/lib/types";
import { useFinance } from "./finance-provider";
import { Button, Card, Field, Money, Sheet, inputClass } from "./ui";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function summary(r: { accounts: number; imported: number }): string {
  const accounts = r.accounts === 1 ? "1 conta atualizada" : `${r.accounts} contas atualizadas`;
  const imported = r.imported === 1 ? "1 lançamento novo" : `${r.imported} lançamentos novos`;
  return `${accounts}, ${imported}.`;
}

/** Bancos conectados pelo Open Finance (Pluggy), na tela Contas. */
export function BankConnections() {
  const { mode, reload } = useFinance();
  const [connections, setConnections] = useState<BankConnectionView[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sheet de conectar aberto; com item, veio do Pluggy Connect e já busca as contas dele.
  const [connecting, setConnecting] = useState<{ itemId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setConnections((await bankApi<{ connections: BankConnectionView[] }>("")).connections);
    } catch (e) {
      setConnections([]);
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da lista
    if (mode === "supabase") void load();
  }, [mode, load]);

  if (mode !== "supabase") {
    return (
      <Card title="Bancos conectados">
        <p className="text-sm text-muted">Para puxar saldos e lançamentos do banco, ligue o app ao Supabase (veja o README).</p>
      </Card>
    );
  }

  async function syncAll() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await bankApi<SyncSummary>("/sincronizar", "POST", {});
      await Promise.all([reload(), load()]);
      setMessage([summary(r), ...r.errors].join(" "));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Abre o Pluggy Connect, onde você escolhe o banco e autoriza pelo Open Finance. Quando termina,
  // a conexão nova (item) vem para cá e seguimos para escolher o que fazer com cada conta.
  async function openPluggy() {
    setBusy(true);
    setMessage(null);
    try {
      const [token, { PluggyConnect }] = await Promise.all([connectToken(), import("pluggy-connect-sdk")]);
      await new PluggyConnect({
        connectToken: token,
        onSuccess: ({ item }) => setConnecting({ itemId: item.id }),
        onError: ({ message }) => setMessage(`A Pluggy não conseguiu conectar: ${message}`),
      }).init();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(c: BankConnectionView) {
    if (!confirm(`Desconectar ${c.name || "este banco"}? As contas e lançamentos já trazidos continuam no app.`)) return;
    try {
      await bankApi("", "DELETE", { id: c.id });
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card
      title="Bancos conectados"
      action={
        <div className="flex gap-2">
          {!!connections?.length && (
            <Button variant="ghost" disabled={busy} onClick={syncAll}>
              {busy ? "Sincronizando…" : "Sincronizar"}
            </Button>
          )}
          <Button disabled={busy} onClick={openPluggy}>Conectar banco</Button>
        </div>
      }
    >
      {connections === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum banco conectado. Conecte pelo Open Finance para o saldo e os lançamentos chegarem sozinhos.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {connections.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p>{c.name || "Banco"}</p>
                <p className="text-xs text-muted">
                  {c.last_synced_at ? `Sincronizado em ${when(c.last_synced_at)}` : "Ainda não sincronizado"}
                </p>
              </div>
              <button onClick={() => disconnect(c)} className="text-sm text-muted">Desconectar</button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      <button onClick={() => setConnecting({ itemId: "" })} className="mt-3 text-xs text-muted underline">
        Já conectei pelo Meu Pluggy e tenho o Item ID
      </button>
      <Sheet open={!!connecting} title="Conectar banco" onClose={() => setConnecting(null)}>
        {connecting && (
          <ConnectForm
            initialItemId={connecting.itemId}
            onDone={async (text) => {
              setConnecting(null);
              setMessage(text);
              await Promise.all([reload(), load()]);
            }}
          />
        )}
      </Sheet>
    </Card>
  );
}

const isCardType = (t: AccountType) => t === "credit_card";

/** Contas do app que podem receber os dados desta conta do banco (cartão com cartão, conta com conta). */
function linkable(accounts: Account[], type: AccountType): Account[] {
  return accounts.filter((a) => !a.external_id && a.type !== "benefit" && isCardType(a.type) === isCardType(type));
}

function ConnectForm({ initialItemId, onDone }: { initialItemId: string; onDone: (message: string) => void }) {
  const { data } = useFinance();
  const [itemId, setItemId] = useState(initialItemId);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookUp = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const p = await bankApi<Preview>("/previa", "POST", { itemId: id.trim() });
      setPreview(p);
      setLinks(Object.fromEntries(p.accounts.map((a) => [a.id, "new"])));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // Veio do Pluggy Connect: já busca as contas, sem pedir o Item ID.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial das contas
    if (initialItemId) void lookUp(initialItemId);
  }, [initialItemId, lookUp]);

  async function connect() {
    const chosen = Object.values(links).filter((v) => v !== "new" && v !== "skip");
    if (new Set(chosen).size !== chosen.length) {
      setError("Cada conta do app só pode receber uma conta do banco.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await bankApi<{ accounts: number; imported: number }>("", "POST", { itemId: itemId.trim(), links });
      onDone(`${preview?.name ?? "Banco"} conectado: ${summary(r)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!preview && initialItemId) {
    return error ? <p className="text-sm text-bad">{error}</p> : <p className="text-sm text-muted">Buscando as contas do banco…</p>;
  }

  if (!preview) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookUp(itemId);
        }}
        className="space-y-3"
      >
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Em meu.pluggy.ai, conecte o banco pelo Open Finance.</li>
          <li>No painel da Pluggy (dashboard.pluggy.ai), abra a conexão e copie o Item ID.</li>
          <li>Cole aqui. Um Item ID por banco.</li>
        </ol>
        <Field label="Item ID">
          <input
            required
            className={`${inputClass} font-mono text-sm`}
            value={itemId}
            placeholder="1a2b3c4d-0000-0000-0000-000000000000"
            onChange={(e) => setItemId(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Buscando…" : "Buscar contas"}</Button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Contas encontradas no {preview.name}
        {preview.lastUpdatedAt ? ` (dados de ${when(preview.lastUpdatedAt)})` : ""}. Escolha o que fazer com cada uma.
      </p>
      {preview.accounts.map((acc) => (
        <Field
          key={acc.id}
          label={`${acc.name} · ${ACCOUNT_TYPE_LABEL[acc.type]}`}
          hint={links[acc.id] && !["new", "skip"].includes(links[acc.id])
            ? "O saldo passa a vir do banco. Lançamentos do banco entram a partir de hoje, para não repetir os que você já digitou."
            : undefined}
        >
          <div className="flex items-center gap-2">
            <select
              className={inputClass}
              value={links[acc.id]}
              onChange={(e) => setLinks({ ...links, [acc.id]: e.target.value })}
            >
              <option value="new">Criar conta nova (traz os últimos 90 dias)</option>
              {linkable(data.accounts, acc.type).map((a) => (
                <option key={a.id} value={a.id}>Usar a conta “{a.name}”</option>
              ))}
              <option value="skip">Não trazer</option>
            </select>
            <Money cents={acc.balance} className="text-sm" />
          </div>
        </Field>
      ))}
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" disabled={busy} onClick={connect}>{busy ? "Conectando…" : "Conectar"}</Button>
        {!initialItemId && (
          <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>Voltar</Button>
        )}
      </div>
    </div>
  );
}
