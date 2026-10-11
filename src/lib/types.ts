// Valores monetários sempre em centavos (inteiro). Datas sempre "YYYY-MM-DD".

export type AccountType = "checking" | "savings" | "cash" | "credit_card" | "benefit";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Saldo atual. Em cartão de crédito, é o valor da fatura em aberto (positivo = devendo). */
  balance: number;
  /** Só para benefícios: valor creditado todo mês. */
  monthly_recharge: number | null;
  /** Só para benefícios: dia do mês em que a recarga cai. */
  recharge_day: number | null;
  /** Só para cartão de crédito: dia em que a fatura fecha. Compras desse dia em diante vão para a próxima. */
  closing_day?: number | null;
  /** Só para cartão de crédito: dia em que a fatura vence. */
  due_day?: number | null;
  created_at?: string;
}

export type Kind = "expense" | "income";

export interface Transaction {
  id: string;
  account_id: string;
  kind: Kind;
  amount: number;
  category: string;
  description: string;
  date: string;
  created_at?: string;
}

export interface Recurring {
  id: string;
  account_id: string;
  kind: Kind;
  amount: number;
  category: string;
  description: string;
  /** Dia do mês (1-31). Em meses mais curtos, cai no último dia. */
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  created_at?: string;
}

export interface Installment {
  id: string;
  account_id: string;
  description: string;
  category: string;
  total_amount: number;
  installments_count: number;
  /** Data da primeira parcela; as demais caem no mesmo dia dos meses seguintes. */
  first_date: string;
  created_at?: string;
}

export type InvestmentKind = "fixed_income" | "treasury" | "stocks" | "reits" | "crypto" | "pension" | "other";
export type InvestmentPurpose = "emergency" | "short_term" | "long_term";
export type Liquidity = "daily" | "at_maturity" | "other";

export interface Investment {
  id: string;
  name: string;
  kind: InvestmentKind;
  institution: string;
  /** Quanto foi aplicado no total. */
  invested_amount: number;
  /** Quanto vale hoje (atualizado pelo usuário). */
  current_amount: number;
  purpose: InvestmentPurpose;
  liquidity: Liquidity;
  maturity_date: string | null;
  created_at?: string;
}

export interface FinanceData {
  accounts: Account[];
  transactions: Transaction[];
  recurring: Recurring[];
  installments: Installment[];
  investments: Investment[];
}

export type TableName = keyof FinanceData;
export type RowOf<T extends TableName> = FinanceData[T][number];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  credit_card: "Cartão de crédito",
  benefit: "Benefício (VR/VA)",
};

export const INVESTMENT_KIND_LABEL: Record<InvestmentKind, string> = {
  fixed_income: "Renda fixa (CDB, LCI, LCA)",
  treasury: "Tesouro Direto",
  stocks: "Ações e ETFs",
  reits: "Fundos imobiliários",
  crypto: "Criptomoedas",
  pension: "Previdência",
  other: "Outros",
};

/** Tipos com oscilação de preço (renda variável). */
export const VARIABLE_INCOME: InvestmentKind[] = ["stocks", "reits", "crypto"];

export const PURPOSE_LABEL: Record<InvestmentPurpose, string> = {
  emergency: "Reserva de emergência",
  short_term: "Meta de curto/médio prazo",
  long_term: "Longo prazo",
};

export const LIQUIDITY_LABEL: Record<Liquidity, string> = {
  daily: "Resgate a qualquer momento",
  at_maturity: "Só no vencimento",
  other: "Outro prazo",
};

export const CATEGORIES = [
  "Alimentação",
  "Mercado",
  "Moradia",
  "Transporte",
  "Saúde",
  "Educação",
  "Lazer",
  "Assinaturas",
  "Compras",
  "Contas",
  "Salário",
  "Outros",
] as const;
