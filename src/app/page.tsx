"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, Empty, Money } from "@/components/ui";
import { useFinance } from "@/components/finance-provider";
import { ProjectionChart } from "@/components/projection-chart";
import { endOfMonth, formatDate, monthLabel, today } from "@/lib/dates";
import { activeInstallments, projection, summary } from "@/lib/finance";
import { portfolioSummary } from "@/lib/portfolio";

export default function Painel() {
  const { data } = useFinance();
  const now = today();
  const s = useMemo(() => summary(data, now), [data, now]);
  const proj = useMemo(() => projection(data, now, 6), [data, now]);
  const parcels = useMemo(() => activeInstallments(data, now), [data, now]);
  const invested = useMemo(() => portfolioSummary(data).current, [data]);
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";

  if (data.accounts.length === 0) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <h1 className="mb-2 text-xl font-semibold">Comece pelas suas contas</h1>
        <p className="mb-4 text-sm text-muted">
          Cadastre conta corrente, cartão e benefícios como VR com o saldo de hoje. O painel aparece em seguida.
        </p>
        <Link href="/contas" className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Cadastrar contas
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <section className="pt-2">
        <p className="text-sm text-muted">Livre para gastar até {formatDate(endOfMonth(now))}</p>
        <Money cents={s.free} className="text-5xl font-semibold tracking-tight" />
        <p className="mt-1 text-xs text-muted">
          Dinheiro em conta + receitas previstas − compromissos que ainda vão sair este mês.
        </p>
        {invested > 0 && (
          <Link href="/investimentos" className="mt-1 inline-block text-xs text-accent">
            Mais {fmtShort(invested)} investidos
          </Link>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em conta" cents={s.available} />
        <Stat label="Benefícios" cents={s.benefits} note={s.benefitsCommitted ? `${fmtShort(s.benefitsCommitted)} previstos` : undefined} />
        <Stat label="Comprometido no mês" cents={s.committed} note={s.cardBills ? `inclui ${fmtShort(s.cardBills)} de fatura` : undefined} />
        <Stat label="Receitas previstas" cents={s.expectedIncome} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ainda este mês" action={<Link href="/compromissos" className="text-sm text-accent">Gerenciar</Link>}>
          {s.upcoming.length === 0 ? (
            <Empty>Nenhum compromisso até o fim do mês.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {s.upcoming.map((i) => (
                <li key={`${i.source}-${i.source_id}-${i.date}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">
                      {i.description}
                      {i.installment && <span className="text-muted"> · {i.installment.n}/{i.installment.of}</span>}
                    </p>
                    <p className="text-xs text-muted">{formatDate(i.date)} · {accountName(i.account_id)}</p>
                  </div>
                  <Money cents={i.kind === "expense" ? -i.amount : i.amount} className={i.kind === "income" ? "text-good" : ""} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Próximos 6 meses">
          <ProjectionChart months={proj} />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Ver tabela</summary>
            <table className="tabular mt-2 w-full text-right text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="text-left font-normal">Mês</th>
                  <th className="font-normal">Entradas</th>
                  <th className="font-normal">Fixos</th>
                  <th className="font-normal">Parcelas</th>
                  <th className="font-normal">Livre acum.</th>
                </tr>
              </thead>
              <tbody>
                {proj.map((m) => (
                  <tr key={m.month} className="border-t border-border">
                    <td className="py-1 text-left">{monthLabel(m.month)}</td>
                    <td>{fmtShort(m.income)}</td>
                    <td>{fmtShort(m.recurringExpenses)}</td>
                    <td>{fmtShort(m.installmentExpenses)}</td>
                    <td className={m.projectedFree < 0 ? "text-bad" : ""}>{fmtShort(m.projectedFree)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      </div>

      <Card title="Parcelamentos em andamento">
        {parcels.length === 0 ? (
          <Empty>Nenhum parcelamento em aberto.</Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {parcels.map((p) => {
              const total = p.installment.installments_count;
              return (
                <li key={p.installment.id} className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{p.installment.description}</span>
                    <Money cents={p.parcelAmount} className="text-muted" />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-accent-soft" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={p.paid} aria-label={`${p.paid} de ${total} parcelas pagas`}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(p.paid / total) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted">
                    {p.paid}/{total} pagas · faltam {fmtShort(p.remainingAmount)} · termina em {monthLabel(p.lastDate.slice(0, 7))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function fmtShort(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function Stat({ label, cents, note }: { label: string; cents: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <Money cents={cents} className="text-lg font-semibold sm:text-xl" />
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
