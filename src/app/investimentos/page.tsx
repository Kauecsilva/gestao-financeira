"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/components/finance-provider";
import { Button, Card, Empty, Field, Money, MoneyInput, PageHeader, Sheet, inputClass, uid } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { portfolioSummary } from "@/lib/portfolio";
import {
  INVESTMENT_KIND_LABEL,
  LIQUIDITY_LABEL,
  PURPOSE_LABEL,
  type Investment,
  type InvestmentKind,
  type InvestmentPurpose,
  type Liquidity,
} from "@/lib/types";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default function Investimentos() {
  const { data } = useFinance();
  const [editing, setEditing] = useState<Investment | null>(null);
  const p = useMemo(() => portfolioSummary(data), [data]);

  const blank = (): Investment => ({
    id: uid(), name: "", kind: "fixed_income", institution: "", invested_amount: 0, current_amount: 0,
    purpose: "long_term", liquidity: "daily", maturity_date: null,
  });

  const groups = (Object.keys(PURPOSE_LABEL) as InvestmentPurpose[])
    .map((purpose) => ({ purpose, items: data.investments.filter((i) => i.purpose === purpose) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title="Investimentos" action={<Button onClick={() => setEditing(blank())}>Novo</Button>} />

      {data.investments.length === 0 ? (
        <Card>
          <Empty>Cadastre seus investimentos para acompanhar a carteira e receber sugestões no Assistente.</Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Valor atual" value={<Money cents={p.current} />} />
            <Tile label="Aplicado" value={<Money cents={p.invested} />} />
            <Tile
              label="Rendimento"
              value={<Money cents={p.gain} className={p.gain > 0 ? "text-good" : ""} />}
              note={p.gainRatio != null ? `${p.gain >= 0 ? "+" : ""}${pct(p.gainRatio)} sobre o aplicado` : undefined}
            />
            <Tile label="Reserva de emergência" value={<Money cents={p.emergencyReserve} />} note="inclui a poupança" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              {groups.map((g) => (
                <Card key={g.purpose} title={PURPOSE_LABEL[g.purpose]}>
                  <ul className="divide-y divide-border">
                    {g.items.map((i) => {
                      const gain = i.current_amount - i.invested_amount;
                      return (
                        <li key={i.id}>
                          <button onClick={() => setEditing(i)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm">
                            <div className="min-w-0">
                              <p className="truncate">{i.name}</p>
                              <p className="text-xs text-muted">
                                {INVESTMENT_KIND_LABEL[i.kind].split(" (")[0]}
                                {i.institution && ` · ${i.institution}`}
                                {i.maturity_date && ` · vence ${formatDate(i.maturity_date)}`}
                              </p>
                            </div>
                            <span className="text-right">
                              <Money cents={i.current_amount} />
                              {i.invested_amount > 0 && (
                                <span className={`tabular block text-xs ${gain < 0 ? "text-bad" : "text-muted"}`}>
                                  {gain >= 0 ? "+" : ""}
                                  {formatBRL(gain)}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>

            <Card title="Divisão da carteira">
              <ul className="space-y-3 text-sm">
                {p.byKind.map((k) => (
                  <li key={k.kind}>
                    <div className="flex justify-between gap-2">
                      <span>{INVESTMENT_KIND_LABEL[k.kind].split(" (")[0]}</span>
                      <span className="tabular text-muted">{pct(k.share)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-accent-soft">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${k.share * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Renda variável (ações, FIIs, cripto): {pct(p.variableShare)}</p>
            </Card>
          </div>
        </div>
      )}

      <Sheet
        open={!!editing}
        title={editing && data.investments.some((i) => i.id === editing.id) ? "Editar investimento" : "Novo investimento"}
        onClose={() => setEditing(null)}
      >
        {editing && <InvestmentForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <div className="text-lg font-semibold sm:text-xl">{value}</div>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

function InvestmentForm({ initial, onDone }: { initial: Investment; onDone: () => void }) {
  const { data, save, remove } = useFinance();
  const [i, setI] = useState(initial);
  const exists = data.investments.some((x) => x.id === i.id);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await save("investments", { ...i, maturity_date: i.liquidity === "at_maturity" ? i.maturity_date : null });
        onDone();
      }}
      className="space-y-3"
    >
      <Field label="Nome">
        <input required className={inputClass} value={i.name} placeholder="Ex.: Tesouro Selic 2029, CDB Inter" onChange={(e) => setI({ ...i, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select className={inputClass} value={i.kind} onChange={(e) => setI({ ...i, kind: e.target.value as InvestmentKind })}>
            {(Object.keys(INVESTMENT_KIND_LABEL) as InvestmentKind[]).map((k) => (
              <option key={k} value={k}>{INVESTMENT_KIND_LABEL[k].split(" (")[0]}</option>
            ))}
          </select>
        </Field>
        <Field label="Instituição">
          <input className={inputClass} value={i.institution} placeholder="Ex.: Nubank" onChange={(e) => setI({ ...i, institution: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quanto aplicou">
          <MoneyInput value={i.invested_amount || null} onChange={(v) => setI({ ...i, invested_amount: v ?? 0 })} />
        </Field>
        <Field label="Quanto vale hoje">
          <MoneyInput required value={i.current_amount || null} onChange={(v) => setI({ ...i, current_amount: v ?? 0 })} />
        </Field>
      </div>
      <Field label="Para que é esse dinheiro?">
        <select className={inputClass} value={i.purpose} onChange={(e) => setI({ ...i, purpose: e.target.value as InvestmentPurpose })}>
          {(Object.keys(PURPOSE_LABEL) as InvestmentPurpose[]).map((k) => (
            <option key={k} value={k}>{PURPOSE_LABEL[k]}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Resgate">
          <select className={inputClass} value={i.liquidity} onChange={(e) => setI({ ...i, liquidity: e.target.value as Liquidity })}>
            {(Object.keys(LIQUIDITY_LABEL) as Liquidity[]).map((k) => (
              <option key={k} value={k}>{LIQUIDITY_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        {i.liquidity === "at_maturity" && (
          <Field label="Vencimento">
            <input type="date" className={inputClass} value={i.maturity_date ?? ""} onChange={(e) => setI({ ...i, maturity_date: e.target.value || null })} />
          </Field>
        )}
      </div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" disabled={!i.current_amount}>Salvar</Button>
        {exists && (
          <Button type="button" variant="danger" onClick={async () => { await remove("investments", i.id); onDone(); }}>
            Apagar
          </Button>
        )}
      </div>
    </form>
  );
}
