import { describe, expect, it } from "vitest";
import { portfolioSummary } from "./portfolio";
import type { FinanceData, Investment } from "./types";

const inv = (over: Partial<Investment>): Investment => ({
  id: "i",
  name: "",
  kind: "fixed_income",
  institution: "",
  invested_amount: 0,
  current_amount: 0,
  purpose: "long_term",
  liquidity: "daily",
  maturity_date: null,
  ...over,
});

const data: FinanceData = {
  accounts: [{ id: "p", name: "Poupança", type: "savings", balance: 100000, monthly_recharge: null, recharge_day: null }],
  transactions: [],
  recurring: [],
  installments: [],
  investments: [
    inv({ id: "1", kind: "treasury", purpose: "emergency", invested_amount: 500000, current_amount: 550000 }),
    inv({ id: "2", kind: "stocks", invested_amount: 300000, current_amount: 270000 }),
    inv({ id: "3", kind: "crypto", invested_amount: 100000, current_amount: 180000 }),
  ],
};

describe("portfolioSummary", () => {
  const p = portfolioSummary(data);

  it("soma aplicado, atual e ganho", () => {
    expect(p.invested).toBe(900000);
    expect(p.current).toBe(1000000);
    expect(p.gain).toBe(100000);
    expect(p.gainRatio).toBeCloseTo(0.1111, 3);
  });

  it("divide por tipo, do maior para o menor", () => {
    expect(p.byKind.map((k) => k.kind)).toEqual(["treasury", "stocks", "crypto"]);
    expect(p.byKind[0].share).toBeCloseTo(0.55);
  });

  it("conta renda variável e reserva", () => {
    expect(p.variableShare).toBeCloseTo(0.45);
    expect(p.emergencyReserve).toBe(650000); // 5.500 do Tesouro + 1.000 da poupança
  });

  it("carteira vazia não divide por zero", () => {
    const empty = portfolioSummary({ ...data, investments: [] });
    expect(empty.gainRatio).toBeNull();
    expect(empty.variableShare).toBe(0);
  });
});
