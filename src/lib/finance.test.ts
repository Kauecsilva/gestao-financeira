import { describe, expect, it } from "vitest";
import {
  activeInstallments,
  balanceDelta,
  cardInvoices,
  installmentSchedule,
  invoiceDueDate,
  projection,
  recurringOccurrences,
  summary,
} from "./finance";
import type { Account, FinanceData, Installment, Recurring } from "./types";

const acc = (over: Partial<Account>): Account => ({
  id: "a",
  name: "Conta",
  type: "checking",
  balance: 0,
  monthly_recharge: null,
  recharge_day: null,
  ...over,
});

const rec = (over: Partial<Recurring>): Recurring => ({
  id: "r",
  account_id: "nubank",
  kind: "expense",
  amount: 0,
  category: "Assinaturas",
  description: "",
  day_of_month: 1,
  start_date: "2026-01-01",
  end_date: null,
  ...over,
});

const inst = (over: Partial<Installment>): Installment => ({
  id: "i",
  account_id: "nubank",
  description: "Celular",
  category: "Compras",
  total_amount: 120000,
  installments_count: 12,
  first_date: "2026-03-10",
  ...over,
});

const base: FinanceData = {
  accounts: [
    acc({ id: "nubank", balance: 300000 }),
    acc({ id: "poup", type: "savings", balance: 100000 }),
    acc({ id: "cartao", type: "credit_card", balance: 45000 }),
    acc({ id: "vr", type: "benefit", balance: 60000, monthly_recharge: 80000, recharge_day: 5 }),
  ],
  transactions: [],
  recurring: [
    rec({ id: "netflix", amount: 5590, day_of_month: 20 }),
    rec({ id: "aluguel", amount: 150000, day_of_month: 5 }),
    rec({ id: "salario", kind: "income", amount: 500000, day_of_month: 30, category: "Salário" }),
  ],
  installments: [inst({})],
  investments: [],
};

describe("recurringOccurrences", () => {
  it("cai no último dia em meses curtos", () => {
    const r = rec({ day_of_month: 31 });
    expect(recurringOccurrences(r, "2026-02-01", "2026-04-30")).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("respeita início e fim", () => {
    const r = rec({ day_of_month: 15, start_date: "2026-03-20", end_date: "2026-05-14" });
    expect(recurringOccurrences(r, "2026-01-01", "2026-12-31")).toEqual(["2026-04-15"]);
  });
});

describe("installmentSchedule", () => {
  it("põe a sobra de centavos na primeira parcela", () => {
    const s = installmentSchedule(inst({ total_amount: 10000, installments_count: 3 }));
    expect(s.map((p) => p.amount)).toEqual([3334, 3333, 3333]);
    expect(s.map((p) => p.date)).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
  });
});

describe("summary", () => {
  // Hoje: 10/10/2026. Até o fim do mês faltam Netflix (20), salário (30) e a parcela 8/12 (10).
  const s = summary(base, "2026-10-10");

  it("separa dinheiro de benefícios", () => {
    expect(s.available).toBe(400000);
    expect(s.benefits).toBe(60000);
    expect(s.cardBills).toBe(45000);
  });

  it("conta só o que ainda vai sair no mês", () => {
    // Aluguel do dia 5 já passou. Netflix 55,90 + parcela 100,00 + fatura 450,00.
    expect(s.committed).toBe(5590 + 10000 + 45000);
    expect(s.expectedIncome).toBe(500000);
    expect(s.free).toBe(400000 + 500000 - 60590);
  });

  it("lista a parcela com número", () => {
    const parcela = s.upcoming.find((i) => i.source === "installment");
    expect(parcela?.installment).toEqual({ n: 8, of: 12 });
  });
});

describe("projection", () => {
  it("libera dinheiro quando o parcelamento termina", () => {
    const p = projection(base, "2026-10-10", 6);
    expect(p.map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    // Última parcela (12/12) em fev/27.
    expect(p[3].installmentExpenses).toBe(10000);
    expect(p[4].installmentExpenses).toBe(0);
    expect(p[0].net).toBe(500000 - 150000 - 5590 - 10000);
    expect(p[0].projectedFree).toBe(summary(base, "2026-10-10").free + p[0].net);
  });

  it("não mistura recarga de benefício com dinheiro", () => {
    const p = projection(base, "2026-10-10", 1);
    expect(p[0].income).toBe(500000);
  });
});

describe("activeInstallments", () => {
  it("mostra parcelas restantes e a última data", () => {
    const [s] = activeInstallments(base, "2026-10-10");
    expect(s.paid).toBe(7);
    expect(s.remaining).toBe(5);
    expect(s.remainingAmount).toBe(50000);
    expect(s.lastDate).toBe("2027-02-10");
  });

  it("some quando todas as parcelas passaram", () => {
    expect(activeInstallments(base, "2027-02-11")).toEqual([]);
  });
});

describe("balanceDelta", () => {
  it("gasto no cartão aumenta a fatura", () => {
    expect(balanceDelta(acc({ type: "credit_card" }), "expense", 1000)).toBe(1000);
    expect(balanceDelta(acc({}), "expense", 1000)).toBe(-1000);
    expect(balanceDelta(acc({}), "income", 1000)).toBe(1000);
  });
});

describe("cartão com fechamento e vencimento", () => {
  // Fecha dia 28, vence dia 5 do mês seguinte.
  const card = acc({ id: "card", type: "credit_card", balance: 0, closing_day: 28, due_day: 5 }) as Account & {
    closing_day: number;
    due_day: number;
  };

  it("compra antes do fechamento vence no mês seguinte; no dia do fechamento, pula um mês", () => {
    expect(invoiceDueDate(card, "2026-10-27")).toBe("2026-11-05");
    expect(invoiceDueDate(card, "2026-10-28")).toBe("2026-12-05");
  });

  it("vencimento depois do fechamento cai no mesmo mês", () => {
    const c = { ...card, closing_day: 3, due_day: 10 };
    expect(invoiceDueDate(c, "2026-10-02")).toBe("2026-10-10");
    expect(invoiceDueDate(c, "2026-10-03")).toBe("2026-11-10");
  });

  it("fechamento dia 31 em mês curto fecha no último dia", () => {
    const c = { ...card, closing_day: 31, due_day: 8 };
    expect(invoiceDueDate(c, "2026-02-27")).toBe("2026-03-08");
    expect(invoiceDueDate(c, "2026-02-28")).toBe("2026-04-08");
  });

  // Hoje 10/10. Fatura de 05/11 tem 300,00 (digitado na conta); compra de 29/10 vai para 05/12.
  const data: FinanceData = {
    ...base,
    accounts: [acc({ id: "nubank", balance: 300000 }), { ...card, balance: 30000 + 20000 }],
    transactions: [
      { id: "t", account_id: "card", kind: "expense", amount: 20000, category: "Compras", description: "", date: "2026-10-29" },
    ],
    recurring: [rec({ id: "spotify", account_id: "card", amount: 2000, day_of_month: 15 })],
    installments: [],
  };

  it("separa a fatura em aberto pelos vencimentos", () => {
    expect(cardInvoices(data, { ...card, balance: 50000 }, "2026-10-10")).toEqual([
      { due: "2026-11-05", amount: 30000 },
      { due: "2026-12-05", amount: 20000 },
    ]);
  });

  it("não tira do livre deste mês o que só vence no mês que vem", () => {
    const s = summary(data, "2026-10-10");
    expect(s.cardBills).toBe(50000);
    expect(s.cardBillsDue).toBe(0);
    expect(s.committed).toBe(0);
    expect(s.free).toBe(300000);
  });

  it("projeta faturas e fixos do cartão no mês do vencimento", () => {
    const [nov, dez] = projection(data, "2026-10-10", 2);
    // Spotify de 15/10 vence em 05/11; o de 15/11, em 05/12.
    expect(nov.cardBillExpenses).toBe(30000);
    expect(nov.recurringExpenses).toBe(2000);
    expect(dez.cardBillExpenses).toBe(20000);
    expect(dez.recurringExpenses).toBe(2000);
  });

  it("fixo no cartão que já passou da data não conta de novo", () => {
    // Em 20/10 o Spotify de 15/10 já está na fatura em aberto.
    const [nov] = projection(data, "2026-10-20", 1);
    expect(nov.recurringExpenses).toBe(0);
  });

  it("lista a fatura que vence no mês entre os compromissos", () => {
    const s = summary(data, "2026-11-01");
    const bill = s.upcoming.find((i) => i.source === "card_bill");
    expect(bill).toMatchObject({ date: "2026-11-05", amount: 30000, description: "Fatura Conta" });
    expect(s.cardBillsDue).toBe(30000);
  });
});
