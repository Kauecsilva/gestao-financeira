import { describe, expect, it } from "vitest";
import {
  activeInstallments,
  balanceDelta,
  installmentSchedule,
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
