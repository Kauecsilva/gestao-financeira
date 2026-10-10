import { describe, expect, it } from "vitest";
import { averageVariableSpending, buildSnapshot } from "./snapshot";
import type { FinanceData } from "./types";

const data: FinanceData = {
  accounts: [
    { id: "a", name: "Nubank", type: "checking", balance: 200000, monthly_recharge: null, recharge_day: null },
    { id: "vr", name: "VR", type: "benefit", balance: 50000, monthly_recharge: 80000, recharge_day: 5 },
  ],
  transactions: [
    { id: "t1", account_id: "a", kind: "expense", amount: 30000, category: "Lazer", description: "", date: "2026-09-10" },
    { id: "t2", account_id: "a", kind: "expense", amount: 50000, category: "Mercado", description: "", date: "2026-08-03" },
    { id: "t3", account_id: "a", kind: "income", amount: 99999, category: "Salário", description: "", date: "2026-08-05" },
  ],
  recurring: [],
  installments: [],
  investments: [],
};

describe("averageVariableSpending", () => {
  it("faz a média só dos meses com lançamento", () => {
    expect(averageVariableSpending(data, "2026-10-10")).toBe(40000);
  });
});

describe("buildSnapshot", () => {
  it("traz os números do painel e o histórico", () => {
    const text = buildSnapshot(data, "2026-10-10");
    expect(text).toContain("Hoje: 10/10/2026");
    expect(text).toMatch(/LIVRE até o fim do mês: R\$\s2\.000,00/);
    expect(text).toMatch(/Lazer: R\$\s300,00/);
    expect(text).toMatch(/Média mensal dos lançamentos nos últimos 3 meses: R\$\s400,00/);
  });
});
