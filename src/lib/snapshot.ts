import { addMonths, formatDate, monthKey, monthLabel, parts } from "./dates";
import { activeInstallments, projection, spentByCategory, summary } from "./finance";
import { formatBRL } from "./money";
import { portfolioSummary } from "./portfolio";
import { ACCOUNT_TYPE_LABEL, INVESTMENT_KIND_LABEL, PURPOSE_LABEL, type FinanceData } from "./types";

// Resumo em texto da situação financeira, enviado ao assistente junto com a pergunta.
// Os números vêm todos daqui: a IA explica e recomenda, mas não refaz as contas.

const brl = formatBRL;

/** Média mensal dos gastos lançados nos últimos `months` meses fechados (só os meses com lançamento). */
export function averageVariableSpending(data: FinanceData, today: string, months = 3): number {
  const { y, m } = parts(today);
  const totals: number[] = [];
  for (let i = 1; i <= months; i++) {
    const prev = addMonths(y, m, -i);
    const key = `${prev.y}-${String(prev.m).padStart(2, "0")}`;
    const total = spentByCategory(data, key).reduce((s, c) => s + c.amount, 0);
    if (total > 0) totals.push(total);
  }
  return totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
}

export function buildSnapshot(data: FinanceData, today: string): string {
  const s = summary(data, today);
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "?";
  const lines: string[] = [];
  const section = (title: string, rows: string[], empty = "nenhum") => {
    lines.push("", `## ${title}`);
    lines.push(...(rows.length ? rows : [empty]));
  };

  lines.push(`Hoje: ${formatDate(today)}`);

  section(
    "Contas",
    data.accounts.map((a) => {
      const extra =
        a.type === "benefit" && a.monthly_recharge
          ? ` (recarga de ${brl(a.monthly_recharge)} todo dia ${a.recharge_day}; só serve para alimentação/mercado)`
          : a.type === "credit_card"
            ? " (fatura em aberto)"
            : "";
      return `- ${a.name} [${ACCOUNT_TYPE_LABEL[a.type]}]: ${brl(a.balance)}${extra}`;
    }),
  );

  section("Resumo do mês atual (calculado pelo app)", [
    `- Em conta (corrente + poupança + dinheiro): ${brl(s.available)}`,
    `- Benefícios (VR/VA): ${brl(s.benefits)}`,
    `- Faturas de cartão em aberto: ${brl(s.cardBills)}`,
    `- Receitas previstas até o fim do mês: ${brl(s.expectedIncome)}`,
    `- Comprometido até o fim do mês (fixos + parcelas + faturas): ${brl(s.committed)}`,
    `- LIVRE até o fim do mês: ${brl(s.free)}`,
    `- Gastos previstos no mês pagos com benefício: ${brl(s.benefitsCommitted)}`,
  ]);

  section(
    "Ainda vai entrar ou sair este mês",
    s.upcoming.map(
      (i) =>
        `- ${formatDate(i.date)} ${i.kind === "income" ? "+" : "-"}${brl(i.amount)} ${i.description}` +
        `${i.installment ? ` (parcela ${i.installment.n}/${i.installment.of})` : ""} · ${accountName(i.account_id)}`,
    ),
  );

  section(
    "Fixos mensais",
    data.recurring.map(
      (r) =>
        `- ${r.description}: ${r.kind === "income" ? "receita" : "gasto"} de ${brl(r.amount)} todo dia ${r.day_of_month}` +
        ` · ${accountName(r.account_id)}${r.end_date ? ` · até ${formatDate(r.end_date)}` : ""}`,
    ),
  );

  section(
    "Parcelamentos em andamento",
    activeInstallments(data, today).map(
      (p) =>
        `- ${p.installment.description}: ${brl(p.parcelAmount)}/mês, ${p.paid}/${p.installment.installments_count} pagas,` +
        ` faltam ${brl(p.remainingAmount)}, última parcela em ${monthLabel(monthKey(p.lastDate))}`,
    ),
  );

  section(
    "Projeção dos próximos 6 meses (só fixos e parcelas; NÃO inclui gastos do dia a dia)",
    projection(data, today, 6).map(
      (m) =>
        `- ${monthLabel(m.month)}: entradas ${brl(m.income)}, fixos ${brl(m.recurringExpenses)},` +
        ` parcelas ${brl(m.installmentExpenses)}, saldo do mês ${brl(m.net)}, livre acumulado ${brl(m.projectedFree)}`,
    ),
  );

  const { y, m } = parts(today);
  const prev = addMonths(y, m, -1);
  const prevKey = `${prev.y}-${String(prev.m).padStart(2, "0")}`;
  const byCat = (key: string) => spentByCategory(data, key).map((c) => `- ${c.category}: ${brl(c.amount)}`);
  section(`Gastos lançados em ${monthLabel(monthKey(today))} (mês atual, até hoje)`, byCat(monthKey(today)));
  section(`Gastos lançados em ${monthLabel(prevKey)}`, byCat(prevKey));

  const p = portfolioSummary(data);
  section(
    `Investimentos (atual ${brl(p.current)}, aplicado ${brl(p.invested)}, reserva de emergência ${brl(p.emergencyReserve)} incluindo poupança)`,
    data.investments.map(
      (i) =>
        `- ${i.name} [${INVESTMENT_KIND_LABEL[i.kind]}, ${PURPOSE_LABEL[i.purpose]}]: vale ${brl(i.current_amount)}, aplicado ${brl(i.invested_amount)}` +
        `${i.maturity_date ? `, vence ${formatDate(i.maturity_date)}` : ""}`,
    ),
  );

  const avg = averageVariableSpending(data, today);
  section("Gasto do dia a dia", [
    avg
      ? `- Média mensal dos lançamentos nos últimos 3 meses: ${brl(avg)}`
      : "- Ainda não há histórico de lançamentos suficiente para estimar.",
  ]);

  return lines.join("\n").trim();
}
