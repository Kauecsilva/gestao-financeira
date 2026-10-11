import { describe, expect, it } from "vitest";
import {
  accountName,
  accountTypeOf,
  cardDays,
  categoryOf,
  isoToLocalDate,
  syncFrom,
  toTransaction,
  type PluggyAccount,
  type PluggyTransaction,
} from "./bank-sync";

const account = (over: Partial<PluggyAccount> = {}): PluggyAccount => ({
  id: "acc",
  type: "BANK",
  subtype: "CHECKING_ACCOUNT",
  name: "Conta Corrente",
  marketingName: null,
  number: "0001/12345-6",
  balance: 1234.56,
  creditData: null,
  ...over,
});

const tx = (over: Partial<PluggyTransaction> = {}): PluggyTransaction => ({
  id: "t1",
  date: "2026-10-05T03:00:00.000Z",
  description: "IFOOD *RESTAURANTE",
  descriptionRaw: null,
  type: "DEBIT",
  amount: -42.9,
  amountInAccountCurrency: null,
  category: "Food delivery",
  status: "POSTED",
  ...over,
});

describe("contas", () => {
  it("mapeia o tipo", () => {
    expect(accountTypeOf(account())).toBe("checking");
    expect(accountTypeOf(account({ subtype: "SAVINGS_ACCOUNT" }))).toBe("savings");
    expect(accountTypeOf(account({ type: "CREDIT", subtype: "CREDIT_CARD" }))).toBe("credit_card");
  });

  it("dá nome com o banco e o final do cartão", () => {
    expect(accountName("Nubank", account())).toBe("Nubank · Conta Corrente");
    expect(accountName("Nubank", account({ type: "CREDIT", subtype: "CREDIT_CARD", number: "5162 **** **** 1234" }))).toBe(
      "Cartão Nubank •1234",
    );
  });

  it("tira o dia de fechamento e vencimento do cartão", () => {
    const card = account({
      type: "CREDIT",
      subtype: "CREDIT_CARD",
      creditData: { balanceCloseDate: "2026-10-03T00:00:00.000Z", balanceDueDate: "2026-10-10T00:00:00.000Z" },
    });
    expect(cardDays(card)).toEqual({ closing_day: 3, due_day: 10 });
    expect(cardDays(account())).toEqual({ closing_day: null, due_day: null });
  });
});

describe("datas", () => {
  it("mantém datas sem horário e converte as com horário para Brasília", () => {
    expect(isoToLocalDate("2026-10-05T00:00:00.000Z")).toBe("2026-10-05");
    expect(isoToLocalDate("2026-10-05T03:00:00.000Z")).toBe("2026-10-05");
    // 23h30 em Brasília do dia 5 = 02h30 UTC do dia 6.
    expect(isoToLocalDate("2026-10-06T02:30:00.000Z")).toBe("2026-10-05");
    expect(isoToLocalDate("2026-10-05")).toBe("2026-10-05");
  });

  it("busca desde a última sincronização com folga, sem passar do início", () => {
    expect(syncFrom("2026-07-01", null)).toBe("2026-07-01");
    expect(syncFrom("2026-07-01", "2026-10-11T12:00:00.000Z")).toBe("2026-10-01");
    expect(syncFrom("2026-10-08", "2026-10-11T12:00:00.000Z")).toBe("2026-10-08");
  });
});

describe("lançamentos", () => {
  it("vira gasto ou receita em centavos", () => {
    expect(toTransaction(tx())).toEqual({
      external_id: "t1",
      kind: "expense",
      amount: 4290,
      category: "Alimentação",
      description: "IFOOD *RESTAURANTE",
      date: "2026-10-05",
    });
    expect(toTransaction(tx({ type: "CREDIT", amount: 5000, category: "Salary" }))).toMatchObject({
      kind: "income",
      amount: 500000,
      category: "Salário",
    });
  });

  it("usa o valor na moeda da conta em compras no exterior", () => {
    expect(toTransaction(tx({ amount: 10, amountInAccountCurrency: 55.3 }))?.amount).toBe(5530);
  });

  it("ignora pendentes e movimentos entre as próprias contas", () => {
    expect(toTransaction(tx({ status: "PENDING" }))).toBeNull();
    expect(toTransaction(tx({ category: "Credit card payment" }))).toBeNull();
    expect(toTransaction(tx({ category: "Same person transfer" }))).toBeNull();
    expect(toTransaction(tx({ amount: 0 }))).toBeNull();
  });

  it("traduz as categorias da Pluggy", () => {
    expect(categoryOf("Groceries")).toBe("Mercado");
    expect(categoryOf("Taxi and ride-hailing")).toBe("Transporte");
    expect(categoryOf("Gas stations")).toBe("Transporte");
    expect(categoryOf("Electricity")).toBe("Moradia");
    expect(categoryOf("Video streaming")).toBe("Assinaturas");
    expect(categoryOf("Pharmacy")).toBe("Saúde");
    expect(categoryOf("Vehicle insurance")).toBe("Contas");
    expect(categoryOf("Bank fees")).toBe("Contas");
    expect(categoryOf("Clothing")).toBe("Compras");
    expect(categoryOf("Transfer - PIX")).toBe("Outros");
    expect(categoryOf(null)).toBe("Outros");
  });
});
