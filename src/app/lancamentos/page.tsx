"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/components/finance-provider";
import { Button, Card, Empty, Field, Money, MoneyInput, PageHeader, Sheet, inputClass, uid } from "@/components/ui";
import { addMonths, formatDate, monthKey, monthLabel, parts, today } from "@/lib/dates";
import { spentByCategory } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import { CATEGORIES, type Kind, type Transaction } from "@/lib/types";

export default function Lancamentos() {
  const { data, deleteTransaction } = useFinance();
  const [month, setMonth] = useState(() => monthKey(today()));
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Transaction | null>(null);

  const rows = useMemo(
    () =>
      data.transactions
        .filter((t) => monthKey(t.date) === month)
        .sort((a, b) => (a.date === b.date ? (b.created_at ?? "").localeCompare(a.created_at ?? "") : b.date.localeCompare(a.date))),
    [data.transactions, month],
  );
  const byCategory = useMemo(() => spentByCategory(data, month), [data, month]);
  const spent = byCategory.reduce((s, c) => s + c.amount, 0);
  const income = rows.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";

  const shift = (n: number) => {
    const { y, m } = parts(`${month}-01`);
    const next = addMonths(y, m, n);
    setMonth(`${next.y}-${String(next.m).padStart(2, "0")}`);
  };

  return (
    <>
      <PageHeader
        title="Lançamentos"
        action={<Button disabled={data.accounts.length === 0} onClick={() => setAdding(true)}>Novo</Button>}
      />
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-surface px-2 py-1">
        <button onClick={() => shift(-1)} className="px-3 py-2 text-lg" aria-label="Mês anterior">‹</button>
        <span className="font-medium">{monthLabel(month)}</span>
        <button onClick={() => shift(1)} className="px-3 py-2 text-lg" aria-label="Próximo mês">›</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          {rows.length === 0 ? (
            <Empty>{data.accounts.length === 0 ? "Cadastre uma conta antes de lançar gastos." : "Nenhum lançamento neste mês."}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((t) => (
                <li key={t.id}>
                  <button onClick={() => setViewing(t)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{t.description || t.category}</p>
                      <p className="text-xs text-muted">{formatDate(t.date)} · {t.category} · {accountName(t.account_id)}</p>
                    </div>
                    <Money cents={t.kind === "expense" ? -t.amount : t.amount} className={t.kind === "income" ? "text-good" : ""} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Resumo do mês">
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Gastos</dt>
            <dd className="text-right"><Money cents={spent} /></dd>
            <dt className="text-muted">Receitas</dt>
            <dd className="text-right"><Money cents={income} /></dd>
          </dl>
          {byCategory.length > 0 && (
            <ul className="space-y-2 text-sm">
              {byCategory.map((c) => (
                <li key={c.category}>
                  <div className="flex justify-between">
                    <span>{c.category}</span>
                    <span className="tabular text-muted">{formatBRL(c.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-accent-soft">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(c.amount / spent) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Sheet open={adding} title="Novo lançamento" onClose={() => setAdding(false)}>
        {adding && <TransactionForm onDone={() => setAdding(false)} />}
      </Sheet>
      <Sheet open={!!viewing} title="Lançamento" onClose={() => setViewing(null)}>
        {viewing && (
          <div className="space-y-3 text-sm">
            <p className="text-2xl font-semibold"><Money cents={viewing.kind === "expense" ? -viewing.amount : viewing.amount} /></p>
            <p>{viewing.description || viewing.category}</p>
            <p className="text-muted">{formatDate(viewing.date)} · {viewing.category} · {accountName(viewing.account_id)}</p>
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                await deleteTransaction(viewing);
                setViewing(null);
              }}
            >
              Apagar e desfazer no saldo
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function TransactionForm({ onDone }: { onDone: () => void }) {
  const { data, addTransaction } = useFinance();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Alimentação");
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const [date, setDate] = useState(today());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !accountId) return;
    await addTransaction({ id: uid(), kind, amount, description, category, account_id: accountId, date });
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1 text-sm">
        {(["expense", "income"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setCategory(k === "income" ? "Salário" : "Alimentação");
            }}
            className={`rounded-md py-1.5 ${kind === k ? "bg-accent text-white" : ""}`}
          >
            {k === "expense" ? "Gasto" : "Receita"}
          </button>
        ))}
      </div>
      <Field label="Valor">
        <MoneyInput required value={amount} onChange={setAmount} />
      </Field>
      <Field label="Descrição">
        <input className={inputClass} value={description} placeholder="Ex.: Almoço" onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Data">
          <input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Conta">
        <select className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Button className="w-full" disabled={!amount}>Salvar</Button>
    </form>
  );
}
