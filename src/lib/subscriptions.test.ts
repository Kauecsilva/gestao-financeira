import { describe, expect, it } from "vitest";
import { cleanDescription, detectSubscriptions, subscriptionKey, toRecurring } from "./subscriptions";
import type { FinanceData, Transaction } from "./types";

let n = 0;
const tx = (description: string, date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, account_id: "card", kind: "expense", amount, category: "Compras", description, date, ...over,
});
const data = (transactions: Transaction[], recurring: FinanceData["recurring"] = []): FinanceData => ({
  accounts: [], transactions, recurring, installments: [], investments: [],
});
const TODAY = "2026-10-11";

describe("assinaturas", () => {
  it("limpa a descrição do banco", () => {
    expect(cleanDescription("Compra no débito|NETFLIX.COM")).toBe("NETFLIX.COM");
    expect(subscriptionKey("Ebn *Crunchyroll")).toBe("crunchyroll");
    expect(subscriptionKey("Compra no débito|NETFLIX.COM")).toBe("netflix com");
  });

  it("acha cobrança mensal com valor e dia parecidos", () => {
    const found = detectSubscriptions(
      data([
        tx("Compra no débito|NETFLIX.COM", "2026-08-24", 4490),
        tx("Compra no débito|NETFLIX.COM", "2026-09-24", 4490),
        tx("Academia Ino*Pac Siste", "2026-07-13", 14241, { category: "Saúde" }),
        tx("Academia Ino*Pac Siste", "2026-08-20", 14241, { category: "Saúde" }),
        tx("Academia Ino*Pac Siste", "2026-09-13", 10941, { category: "Saúde" }),
      ]),
      TODAY,
    );
    expect(found.map((s) => [s.description, s.category, s.amount, s.day_of_month])).toEqual([
      ["Academia Ino*Pac Siste", "Saúde", 10941, 13],
      ["NETFLIX.COM", "Assinaturas", 4490, 24],
    ]);
  });

  it("ignora gastos que só se repetem por acaso", () => {
    const found = detectSubscriptions(
      data([
        // valor muito diferente
        tx("SABORES ACAI", "2026-08-04", 1624), tx("SABORES ACAI", "2026-09-04", 3360),
        // mais de uma vez por mês
        tx("PAO DA FAZENDA", "2026-08-10", 556), tx("PAO DA FAZENDA", "2026-09-02", 600), tx("PAO DA FAZENDA", "2026-09-10", 600),
        // dias diferentes
        tx("VENEZA PESQUEIRO", "2026-08-02", 4000), tx("VENEZA PESQUEIRO", "2026-09-20", 4000),
        // parou faz tempo
        tx("SPOTIFY", "2026-06-05", 2190), tx("SPOTIFY", "2026-07-05", 2190),
        // genérico
        tx("Transferência enviada pelo Pix", "2026-08-15", 6592), tx("Transferência enviada pelo Pix", "2026-09-15", 6757),
      ]),
      TODAY,
    );
    expect(found).toEqual([]);
  });

  it("aceita uma cobrança recente já marcada como Assinaturas", () => {
    const found = detectSubscriptions(data([tx("Ebn *Crunchyroll", "2026-09-22", 2490, { category: "Assinaturas" })]), TODAY);
    expect(found).toHaveLength(1);
  });

  it("não sugere o que já está nos compromissos", () => {
    const found = detectSubscriptions(
      data(
        [tx("Apple.Com/Bill", "2026-08-13", 590), tx("Apple.Com/Bill", "2026-09-13", 590)],
        [{ id: "r", account_id: "card", kind: "expense", amount: 590, category: "Assinaturas", description: "Apple.com/bill", day_of_month: 13, start_date: "2026-01-01", end_date: null }],
      ),
      TODAY,
    );
    expect(found).toEqual([]);
  });

  it("vira compromisso a partir da próxima cobrança", () => {
    const [s] = detectSubscriptions(data([tx("Apple.Com/Bill", "2026-08-13", 590), tx("Apple.Com/Bill", "2026-09-13", 590)]), TODAY);
    expect(toRecurring(s, "id")).toMatchObject({ start_date: "2026-10-13", day_of_month: 13, amount: 590, account_id: "card", end_date: null });
  });
});
