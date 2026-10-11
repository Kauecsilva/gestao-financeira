"use client";

import { useState } from "react";
import { useFinance } from "@/components/finance-provider";
import { Button, Card, Empty, Field, Money, MoneyInput, PageHeader, Sheet, inputClass, uid } from "@/components/ui";
import { formatDate, today } from "@/lib/dates";
import { cardInvoices, hasBillingDays } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from "@/lib/types";

const ORDER: AccountType[] = ["checking", "savings", "cash", "benefit", "credit_card"];

export default function Contas() {
  const { data } = useFinance();
  const [editing, setEditing] = useState<Account | null>(null);

  const cardLine = (a: Account) => {
    if (!hasBillingDays(a)) return "Fatura em aberto · cadastre o vencimento";
    const next = cardInvoices(data, a, today())[0];
    const days = `Fecha dia ${a.closing_day}, vence dia ${a.due_day}`;
    return next && next.amount > 0 ? `${days} · próxima fatura ${formatBRL(next.amount)} em ${formatDate(next.due).slice(0, 5)}` : days;
  };

  const blank = (): Account => ({ id: uid(), name: "", type: "checking", balance: 0, monthly_recharge: null, recharge_day: null });

  return (
    <>
      <PageHeader title="Contas" action={<Button onClick={() => setEditing(blank())}>Nova conta</Button>} />
      {data.accounts.length === 0 ? (
        <Card>
          <Empty>Nenhuma conta ainda. Comece pela conta corrente com o saldo de hoje.</Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {ORDER.filter((t) => data.accounts.some((a) => a.type === t)).map((type) => (
            <Card key={type} title={ACCOUNT_TYPE_LABEL[type]}>
              <ul className="divide-y divide-border">
                {data.accounts
                  .filter((a) => a.type === type)
                  .map((a) => (
                    <li key={a.id}>
                      <button onClick={() => setEditing(a)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                        <div>
                          <p>{a.name}</p>
                          {a.type === "benefit" && a.monthly_recharge ? (
                            <p className="text-xs text-muted">
                              Recarga de <Money cents={a.monthly_recharge} /> todo dia {a.recharge_day}
                            </p>
                          ) : null}
                          {a.type === "credit_card" && <p className="text-xs text-muted">{cardLine(a)}</p>}
                        </div>
                        <Money cents={a.balance} className="font-medium" />
                      </button>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <Sheet open={!!editing} title={editing && data.accounts.some((a) => a.id === editing.id) ? "Editar conta" : "Nova conta"} onClose={() => setEditing(null)}>
        {editing && <AccountForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function AccountForm({ initial, onDone }: { initial: Account; onDone: () => void }) {
  const { data, save, remove } = useFinance();
  const [a, setA] = useState(initial);
  const exists = data.accounts.some((x) => x.id === a.id);
  const isBenefit = a.type === "benefit";
  const isCard = a.type === "credit_card";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await save("accounts", {
      ...a,
      monthly_recharge: isBenefit ? a.monthly_recharge : null,
      recharge_day: isBenefit && a.monthly_recharge ? a.recharge_day ?? 1 : null,
      closing_day: isCard ? a.closing_day ?? null : null,
      due_day: isCard ? a.due_day ?? null : null,
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nome">
        <input required className={inputClass} value={a.name} placeholder="Ex.: Nubank, VR Alelo" onChange={(e) => setA({ ...a, name: e.target.value })} />
      </Field>
      <Field label="Tipo">
        <select className={inputClass} value={a.type} onChange={(e) => setA({ ...a, type: e.target.value as AccountType })}>
          {ORDER.map((t) => (
            <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </Field>
      <Field
        label={a.type === "credit_card" ? "Fatura em aberto" : "Saldo atual"}
        hint={a.type === "credit_card" ? "Quanto você deve hoje nesse cartão." : undefined}
      >
        <MoneyInput value={a.balance} onChange={(v) => setA({ ...a, balance: v ?? 0 })} />
      </Field>
      {isBenefit && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recarga mensal">
            <MoneyInput value={a.monthly_recharge} onChange={(v) => setA({ ...a, monthly_recharge: v })} />
          </Field>
          <Field label="Dia da recarga">
            <DayInput value={a.recharge_day} onChange={(v) => setA({ ...a, recharge_day: v })} />
          </Field>
        </div>
      )}
      {isCard && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia do fechamento">
              <DayInput required value={a.closing_day} onChange={(v) => setA({ ...a, closing_day: v })} />
            </Field>
            <Field label="Dia do vencimento">
              <DayInput required value={a.due_day} onChange={(v) => setA({ ...a, due_day: v })} />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Compras a partir do dia do fechamento entram na fatura seguinte. Os gastos no crédito saem do
            seu dinheiro no vencimento.
          </p>
        </>
      )}
      <div className="flex gap-2 pt-2">
        <Button className="flex-1">Salvar</Button>
        {exists && (
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              if (!confirm("Apagar a conta e todos os lançamentos, recorrências e parcelamentos dela?")) return;
              await remove("accounts", a.id);
              onDone();
            }}
          >
            Apagar
          </Button>
        )}
      </div>
    </form>
  );
}

function DayInput({ value, onChange, required }: { value: number | null | undefined; onChange: (day: number | null) => void; required?: boolean }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={31}
      required={required}
      className={inputClass}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    />
  );
}
