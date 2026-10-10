import type { FinanceData, InvestmentKind, InvestmentPurpose } from "./types";
import { VARIABLE_INCOME } from "./types";

export interface PortfolioSummary {
  invested: number;
  current: number;
  /** Ganho (ou perda) sobre o valor aplicado. */
  gain: number;
  /** Ganho em fração do aplicado (0.05 = 5%). null quando nada foi aplicado. */
  gainRatio: number | null;
  byKind: { kind: InvestmentKind; amount: number; share: number }[];
  byPurpose: Record<InvestmentPurpose, number>;
  /** Fração da carteira em renda variável (ações, FIIs, cripto). */
  variableShare: number;
  /** Reserva de emergência: investimentos marcados como reserva + contas poupança. */
  emergencyReserve: number;
}

export function portfolioSummary(data: FinanceData): PortfolioSummary {
  const invested = data.investments.reduce((s, i) => s + i.invested_amount, 0);
  const current = data.investments.reduce((s, i) => s + i.current_amount, 0);

  const kinds = new Map<InvestmentKind, number>();
  const byPurpose: Record<InvestmentPurpose, number> = { emergency: 0, short_term: 0, long_term: 0 };
  let variable = 0;
  for (const i of data.investments) {
    kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + i.current_amount);
    byPurpose[i.purpose] += i.current_amount;
    if (VARIABLE_INCOME.includes(i.kind)) variable += i.current_amount;
  }

  const savings = data.accounts.filter((a) => a.type === "savings").reduce((s, a) => s + a.balance, 0);

  return {
    invested,
    current,
    gain: current - invested,
    gainRatio: invested > 0 ? (current - invested) / invested : null,
    byKind: [...kinds]
      .map(([kind, amount]) => ({ kind, amount, share: current > 0 ? amount / current : 0 }))
      .sort((a, b) => b.amount - a.amount),
    byPurpose,
    variableShare: current > 0 ? variable / current : 0,
    emergencyReserve: byPurpose.emergency + savings,
  };
}
