"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFinance } from "@/components/finance-provider";
import { Button, Card, Empty, Field, Money, MoneyInput, PageHeader, Sheet, inputClass, uid } from "@/components/ui";
import { addMonths, dateInMonth, formatDate, monthKey, monthLabel, parts, today } from "@/lib/dates";
import { hasBillingDays, invoiceDueDate, spentByCategory } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import { CATEGORIES, type Account, type Kind, type Transaction } from "@/lib/types";

type Payment = "debit" | "credit";

/** "Nubank · crédito, fatura de 05/11" para gastos no cartão; só o nome da conta nos demais. */
function accountLabel(account: Account | undefined, t: Pick<Transaction, "kind" | "date">): string {
  if (!account) return "";
  if (account.type !== "credit_card") return account.name;
  if (t.kind === "income") return `${account.name} · estorno`;
  const due = hasBillingDays(account) ? `, fatura de ${formatDate(invoiceDueDate(account, t.date)).slice(0, 5)}` : "";
  return `${account.name} · crédito${due}`;
}

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
  const accountOf = (t: Transaction) => accountLabel(data.accounts.find((a) => a.id === t.account_id), t);

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
                      <p className="text-xs text-muted">{formatDate(t.date)} · {t.category} · {accountOf(t)}</p>
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
            <p className="text-muted">{formatDate(viewing.date)} · {viewing.category} · {accountOf(viewing)}</p>
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
  const { data, addTransaction, save } = useFinance();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Alimentação");
  const cards = data.accounts.filter((a) => a.type === "credit_card");
  const debitAccounts = data.accounts.filter((a) => a.type !== "credit_card");
  const [payment, setPayment] = useState<Payment>(debitAccounts.length ? "debit" : "credit");
  const [debitId, setDebitId] = useState(debitAccounts[0]?.id ?? "");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [incomeId, setIncomeId] = useState(debitAccounts[0]?.id ?? data.accounts[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const accountId = kind === "income" ? incomeId : payment === "credit" ? cardId : debitId;
  const card = cards.find((c) => c.id === cardId);
  const [repeats, setRepeats] = useState(false);
  const [endDate, setEndDate] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !accountId) return;
    await addTransaction({ id: uid(), kind, amount, description, category, account_id: accountId, date });
    if (repeats) {
      // Este mês já entrou no saldo pelo lançamento; o fixo começa no mês seguinte.
      const { y, m, d } = parts(date);
      const next = addMonths(y, m, 1);
      await save("recurring", {
        id: uid(),
        kind,
        amount,
        description,
        category,
        account_id: accountId,
        day_of_month: d,
        start_date: dateInMonth(next.y, next.m, d),
        end_date: endDate || null,
      });
    }
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
      {kind === "income" ? (
        <Field label="Conta">
          <select className={inputClass} value={incomeId} onChange={(e) => setIncomeId(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      ) : (
        <>
          <div className="space-y-1">
            <span className="text-sm">Pagamento</span>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1 text-sm">
              {(["debit", "credit"] as Payment[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPayment(p)}
                  className={`rounded-md py-1.5 ${payment === p ? "bg-accent text-white" : ""}`}
                >
                  {p === "debit" ? "Débito / Pix" : "Crédito"}
                </button>
              ))}
            </div>
          </div>
          {payment === "debit" ? (
            debitAccounts.length ? (
              <Field label="Conta">
                <select className={inputClass} value={debitId} onChange={(e) => setDebitId(e.target.value)}>
                  {debitAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            ) : (
              <p className="text-sm text-muted">
                Nenhuma conta para débito. <Link href="/contas" className="text-accent">Cadastre em Contas</Link>.
              </p>
            )
          ) : cards.length ? (
            <Field
              label="Cartão"
              hint={
                hasBillingDays(card)
                  ? `Entra na fatura que vence em ${formatDate(invoiceDueDate(card, date))}.`
                  : "Cadastre o fechamento e o vencimento do cartão em Contas para saber em qual fatura cai."
              }
            >
              <select className={inputClass} value={cardId} onChange={(e) => setCardId(e.target.value)}>
                {cards.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-muted">
              Nenhum cartão de crédito ainda. <Link href="/contas" className="text-accent">Cadastre em Contas</Link> com
              o dia de fechamento e de vencimento.
            </p>
          )}
        </>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} className="size-4 accent-accent" />
        Repete todo mês no dia {parts(date).d}
      </label>
      {repeats && (
        <Field label="Até quando (opcional)">
          <input type="date" min={date} className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      )}
      <Button className="w-full" disabled={!amount || !accountId}>Salvar</Button>
    </form>
  );
}
