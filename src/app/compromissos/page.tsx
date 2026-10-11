"use client";

import { useState } from "react";
import { useFinance } from "@/components/finance-provider";
import { SubscriptionSuggestions } from "@/components/subscription-suggestions";
import { Button, Card, Empty, Field, Money, MoneyInput, PageHeader, Sheet, inputClass, uid } from "@/components/ui";
import { formatDate, monthLabel, today } from "@/lib/dates";
import { installmentStatus } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import { CATEGORIES, type Installment, type Kind, type Recurring } from "@/lib/types";

type Editing = { type: "recurring"; row: Recurring } | { type: "installment"; row: Installment } | null;

export default function Compromissos() {
  const { data } = useFinance();
  const [editing, setEditing] = useState<Editing>(null);
  const now = today();
  const firstAccount = data.accounts[0]?.id ?? "";
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";

  const newRecurring = (): Recurring => ({
    id: uid(), account_id: firstAccount, kind: "expense", amount: 0, category: "Assinaturas",
    description: "", day_of_month: Number(now.slice(8)), start_date: now, end_date: null,
  });
  const newInstallment = (): Installment => ({
    id: uid(), account_id: firstAccount, description: "", category: "Compras",
    total_amount: 0, installments_count: 2, first_date: now,
  });

  const recurring = [...data.recurring].sort((a, b) => a.day_of_month - b.day_of_month);
  const installments = data.installments.map((i) => installmentStatus(i, now)).sort((a, b) => b.remaining - a.remaining);
  const noAccounts = data.accounts.length === 0;

  return (
    <>
      <PageHeader title="Compromissos" />
      {noAccounts && <Card className="mb-4"><Empty>Cadastre uma conta antes de adicionar compromissos.</Empty></Card>}
      <SubscriptionSuggestions />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Fixos do mês"
          action={<Button variant="ghost" disabled={noAccounts} onClick={() => setEditing({ type: "recurring", row: newRecurring() })}>Adicionar</Button>}
        >
          <p className="mb-2 text-xs text-muted">Assinaturas, aluguel, salário: tudo que se repete todo mês.</p>
          {recurring.length === 0 ? (
            <Empty>Nada cadastrado.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {recurring.map((r) => {
                const ended = r.end_date !== null && r.end_date < now;
                return (
                  <li key={r.id}>
                    <button onClick={() => setEditing({ type: "recurring", row: r })} className={`flex w-full items-center justify-between gap-3 py-2 text-left text-sm ${ended ? "opacity-50" : ""}`}>
                      <div className="min-w-0">
                        <p className="truncate">{r.description || r.category}</p>
                        <p className="text-xs text-muted">
                          Todo dia {r.day_of_month} · {accountName(r.account_id)}
                          {r.end_date && ` · até ${formatDate(r.end_date)}`}
                        </p>
                      </div>
                      <Money cents={r.kind === "expense" ? -r.amount : r.amount} className={r.kind === "income" ? "text-good" : ""} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Parcelamentos"
          action={<Button variant="ghost" disabled={noAccounts} onClick={() => setEditing({ type: "installment", row: newInstallment() })}>Adicionar</Button>}
        >
          <p className="mb-2 text-xs text-muted">Compras parceladas com prazo para acabar.</p>
          {installments.length === 0 ? (
            <Empty>Nada cadastrado.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {installments.map((s) => (
                <li key={s.installment.id}>
                  <button onClick={() => setEditing({ type: "installment", row: s.installment })} className={`flex w-full items-center justify-between gap-3 py-2 text-left text-sm ${s.remaining === 0 ? "opacity-50" : ""}`}>
                    <div className="min-w-0">
                      <p className="truncate">{s.installment.description}</p>
                      <p className="text-xs text-muted">
                        {s.remaining === 0
                          ? "Quitado"
                          : `${s.paid}/${s.installment.installments_count} pagas · última em ${monthLabel(s.lastDate.slice(0, 7))}`}
                      </p>
                    </div>
                    <span className="text-right">
                      <Money cents={-s.parcelAmount} />
                      <span className="block text-xs text-muted">por mês</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Sheet
        open={!!editing}
        title={editing?.type === "installment" ? "Parcelamento" : "Compromisso fixo"}
        onClose={() => setEditing(null)}
      >
        {editing?.type === "recurring" && <RecurringForm key={editing.row.id} initial={editing.row} onDone={() => setEditing(null)} />}
        {editing?.type === "installment" && <InstallmentForm key={editing.row.id} initial={editing.row} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function AccountSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useFinance();
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

function CategorySelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}

function FormActions({ exists, onDelete }: { exists: boolean; onDelete: () => void }) {
  return (
    <div className="flex gap-2 pt-2">
      <Button className="flex-1">Salvar</Button>
      {exists && <Button type="button" variant="danger" onClick={onDelete}>Apagar</Button>}
    </div>
  );
}

function RecurringForm({ initial, onDone }: { initial: Recurring; onDone: () => void }) {
  const { data, save, remove } = useFinance();
  const [r, setR] = useState(initial);
  const exists = data.recurring.some((x) => x.id === r.id);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!r.amount) return;
        await save("recurring", r);
        onDone();
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1 text-sm">
        {(["expense", "income"] as Kind[]).map((k) => (
          <button key={k} type="button" onClick={() => setR({ ...r, kind: k, category: k === "income" ? "Salário" : r.category })} className={`rounded-md py-1.5 ${r.kind === k ? "bg-accent text-white" : ""}`}>
            {k === "expense" ? "Gasto" : "Receita"}
          </button>
        ))}
      </div>
      <Field label="Descrição">
        <input required className={inputClass} value={r.description} placeholder="Ex.: Netflix, Aluguel, Salário" onChange={(e) => setR({ ...r, description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor por mês">
          <MoneyInput required value={r.amount || null} onChange={(v) => setR({ ...r, amount: v ?? 0 })} />
        </Field>
        <Field label="Dia do mês">
          <input type="number" min={1} max={31} required className={inputClass} value={r.day_of_month} onChange={(e) => setR({ ...r, day_of_month: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria"><CategorySelect value={r.category} onChange={(category) => setR({ ...r, category })} /></Field>
        <Field label="Conta"><AccountSelect value={r.account_id} onChange={(account_id) => setR({ ...r, account_id })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Começa em">
          <input type="date" required className={inputClass} value={r.start_date} onChange={(e) => setR({ ...r, start_date: e.target.value })} />
        </Field>
        <Field label="Termina em" hint="Deixe vazio se não tem fim.">
          <input type="date" className={inputClass} value={r.end_date ?? ""} onChange={(e) => setR({ ...r, end_date: e.target.value || null })} />
        </Field>
      </div>
      <FormActions exists={exists} onDelete={async () => { await remove("recurring", r.id); onDone(); }} />
    </form>
  );
}

function InstallmentForm({ initial, onDone }: { initial: Installment; onDone: () => void }) {
  const { data, save, remove } = useFinance();
  const [i, setI] = useState(initial);
  const exists = data.installments.some((x) => x.id === i.id);
  const parcel = i.installments_count > 0 ? Math.round(i.total_amount / i.installments_count) : 0;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!i.total_amount) return;
        await save("installments", i);
        onDone();
      }}
      className="space-y-3"
    >
      <Field label="Descrição">
        <input required className={inputClass} value={i.description} placeholder="Ex.: Celular novo" onChange={(e) => setI({ ...i, description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor total">
          <MoneyInput required value={i.total_amount || null} onChange={(v) => setI({ ...i, total_amount: v ?? 0 })} />
        </Field>
        <Field label="Parcelas">
          <input type="number" min={1} max={120} required className={inputClass} value={i.installments_count} onChange={(e) => setI({ ...i, installments_count: Number(e.target.value) })} />
        </Field>
      </div>
      {i.total_amount > 0 && <p className="text-sm text-muted">{i.installments_count}x de {formatBRL(parcel)}</p>}
      <Field label="Data da 1ª parcela" hint="Se já começou a pagar, use a data da primeira parcela: o app calcula quantas faltam.">
        <input type="date" required className={inputClass} value={i.first_date} onChange={(e) => setI({ ...i, first_date: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria"><CategorySelect value={i.category} onChange={(category) => setI({ ...i, category })} /></Field>
        <Field label="Conta"><AccountSelect value={i.account_id} onChange={(account_id) => setI({ ...i, account_id })} /></Field>
      </div>
      <FormActions exists={exists} onDelete={async () => { await remove("installments", i.id); onDone(); }} />
    </form>
  );
}
