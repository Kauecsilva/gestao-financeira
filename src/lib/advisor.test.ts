import { describe, expect, it } from "vitest";
import { answer, parseAmount, parseQuestion } from "./advisor";
import type { FinanceData } from "./types";

describe("parseAmount", () => {
  it.each([
    ["Quero comprar um tênis de R$ 400", 40000],
    ["celular de R$ 3.000 em 10x", 300000],
    ["gastar 3 mil numa viagem", 300000],
    ["um jantar de 250 reais", 25000],
    ["R$ 1.234,56 no mercado", 123456],
    ["parcelar em 12x um notebook de 4500", 450000],
  ])("%s", (text, cents) => {
    expect(parseAmount(text)).toBe(cents);
  });

  it("ignora número de parcelas e meses", () => {
    expect(parseAmount("em 10x")).toBeNull();
    expect(parseAmount("daqui a 3 meses")).toBeNull();
  });
});

describe("parseQuestion", () => {
  it("reconhece compra parcelada com comparação", () => {
    const q = parseQuestion("Vale mais a pena parcelar um celular de R$ 3.000 em 10x ou pagar à vista?");
    expect(q).toMatchObject({ intent: "purchase", amount: 300000, installments: 10, compare: true });
  });

  it("reconhece investimento mesmo com valor", () => {
    expect(parseQuestion("Tenho R$ 5.000 na poupança. Como planejar meus próximos investimentos?").intent).toBe("investment");
  });

  it("reconhece quanto guardar", () => {
    expect(parseQuestion("Quanto consigo guardar por mês sem apertar?").intent).toBe("savings");
  });

  it("reconhece comida", () => {
    expect(parseQuestion("posso gastar 80 reais no almoço?").food).toBe(true);
  });
});

// Hoje 10/10/2026. Livre do mês: 3.000 + 5.000 de salário − 2.000 de aluguel = 6.000.
// Dia a dia: média de 1.500/mês, nada lançado em outubro.
const data: FinanceData = {
  accounts: [
    { id: "c", name: "Conta", type: "checking", balance: 300000, monthly_recharge: null, recharge_day: null },
    { id: "p", name: "Poupança", type: "savings", balance: 0, monthly_recharge: null, recharge_day: null },
    { id: "vr", name: "VR", type: "benefit", balance: 50000, monthly_recharge: 80000, recharge_day: 5 },
  ],
  transactions: [
    { id: "t1", account_id: "c", kind: "expense", amount: 150000, category: "Mercado", description: "", date: "2026-09-10" },
  ],
  recurring: [
    { id: "s", account_id: "c", kind: "income", amount: 500000, category: "Salário", description: "Salário", day_of_month: 30, start_date: "2026-01-01", end_date: null },
    { id: "a", account_id: "c", kind: "expense", amount: 200000, category: "Moradia", description: "Aluguel", day_of_month: 15, start_date: "2026-01-01", end_date: null },
  ],
  installments: [],
  investments: [],
};

describe("answer", () => {
  it("compra pequena cabe tranquilo", () => {
    const a = answer(data, "2026-10-10", "quero gastar R$ 400 num tênis");
    expect(a).toMatch(/^\*\*Cabe tranquilo\*\*/);
    expect(a).toMatch(/sobram R\$\s4\.100,00/); // 6.000 − 1.500 − 400
  });

  it("compra grande não cabe e diz quando dá", () => {
    const a = answer(data, "2026-10-10", "quero comprar uma TV de R$ 6.000");
    expect(a).toMatch(/^\*\*Melhor não agora\*\*/);
    // Sobra 1.500/mês (5.000 − 2.000 − 1.500): 4.500 + 1.500 = 6.000 em nov, folga só em dez.
    expect(a).toContain("**dez/26**");
  });

  it("parcelado olha o mês mais apertado", () => {
    const a = answer(data, "2026-10-10", "celular de R$ 3.000 em 10x");
    expect(a).toMatch(/^\*\*Cabe tranquilo\*\* em 10x de R\$\s300,00/);
    expect(a).toMatch(/sobram R\$\s1\.200,00/);
  });

  it("comida usa o VR", () => {
    expect(answer(data, "2026-10-10", "posso gastar 80 reais no almoço?")).toContain("pagando com o benefício");
  });

  it("calcula quanto dá para guardar", () => {
    expect(answer(data, "2026-10-10", "quanto consigo guardar por mês?")).toMatch(/cerca de R\$\s1\.500,00 por mês/);
  });

  it("prioriza a reserva de emergência", () => {
    const a = answer(data, "2026-10-10", "como investir?");
    expect(a).toContain("Prioridade: completar a reserva");
    expect(a).toMatch(/R\$\s21\.000,00/); // 6 × (2.000 + 1.500)
    expect(a).toContain("14 meses");
  });

  it("explica o que sabe responder", () => {
    expect(answer(data, "2026-10-10", "oi")).toContain("Eu sei responder");
  });
});

describe("answer com carteira", () => {
  const withPortfolio: FinanceData = {
    ...data,
    investments: [
      { id: "r", name: "Tesouro Selic", kind: "treasury", institution: "", invested_amount: 2000000, current_amount: 2200000, purpose: "emergency", liquidity: "daily", maturity_date: null },
      { id: "c", name: "Bitcoin", kind: "crypto", institution: "", invested_amount: 300000, current_amount: 500000, purpose: "long_term", liquidity: "daily", maturity_date: null },
    ],
  };

  it("usa a reserva cadastrada e aponta concentração em cripto", () => {
    const a = answer(withPortfolio, "2026-10-10", "me ajude a planejar meus próximos investimentos");
    expect(a).toContain("reserva de emergência está completa");
    expect(a).toMatch(/Carteira: R\$\s27\.000,00 \(\+17% sobre o aplicado\)/);
    expect(a).toContain("Cripto já é 19% da carteira");
  });

  it("valor a investir vai para a reserva quando ela está incompleta", () => {
    const a = answer(data, "2026-10-10", "quero investir R$ 1.000, onde coloco?");
    expect(a).toMatch(/^\*\*Coloque os R\$\s1\.000,00 na reserva de emergência/);
  });
});
