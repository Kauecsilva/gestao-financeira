import { monthKey, monthLabel } from "./dates";
import { activeInstallments, projection, summary } from "./finance";
import { formatBRL, parseBRL } from "./money";
import { portfolioSummary } from "./portfolio";
import { averageVariableSpending } from "./snapshot";
import { INVESTMENT_KIND_LABEL, type FinanceData } from "./types";

// Assistente gratuito: entende perguntas simples e responde com regras fixas sobre
// os números do app. Roda inteiro no navegador, sem API.

export type Intent = "purchase" | "savings" | "investment" | "help";

export interface ParsedQuestion {
  intent: Intent;
  amount: number | null;
  installments: number | null;
  /** Pediu para comparar à vista com parcelado. */
  compare: boolean;
  /** Gasto que dá para pagar com VR/VA (comida, mercado). */
  food: boolean;
  /** "Quero investir R$ X": valor a aplicar agora (e não o que já tem). */
  toInvest: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const INSTALLMENTS_RE = /(\d{1,3})\s*(x|vezes|parcelas?)(?![a-z])/;
const MONEY_RE = /(r\$\s*)?(\d[\d.,]*)\s*(mil|k|reais)?(?![\d.,]*\s*(x|vezes|parcela|%|meses|mes|anos|dias)(?![a-z]))/g;

export function parseAmount(text: string): number | null {
  const t = norm(text);
  let best: { cents: number; hasPrefix: boolean } | null = null;
  for (const m of t.matchAll(MONEY_RE)) {
    const [, prefix, num, unit] = m;
    let cents = parseBRL(num.replace(/[.,]$/, ""));
    if (cents == null) continue;
    if (unit === "mil" || unit === "k") cents *= 1000;
    if (!prefix && !unit && cents < 1000) continue; // "2" solto não é valor; R$ 10 ou mais com prefixo/unidade
    const hasPrefix = !!prefix || !!unit;
    if (!best || (hasPrefix && !best.hasPrefix)) best = { cents, hasPrefix };
  }
  return best?.cents ?? null;
}

export function parseQuestion(text: string): ParsedQuestion {
  const t = norm(text);
  const amount = parseAmount(text);
  const inst = t.match(INSTALLMENTS_RE);
  const installments = inst ? Number(inst[1]) : null;
  const compare = /a vista/.test(t) && /(parcel|\d+\s*x)/.test(t);
  const food = /(mercado|comida|restaurante|almoco|jantar|lanche|ifood|padaria|feira|pizza|hamburguer|cafe)/.test(t);

  const buying = /(comprar|gastar|cabe|vale a pena|pagar|parcelar|compra|trocar)/.test(t);
  const investing = /(invest|aplicar|aplicacao|render|tesouro|cdb|acoes|fii|cripto|carteira|reserva)/.test(t);
  const saving = /(guardar|economizar|poupar|juntar|sobra por mes|sobrar por mes)/.test(t);

  let intent: Intent = "help";
  if (investing && !(buying && amount)) intent = "investment";
  else if (amount && (buying || !saving)) intent = "purchase";
  else if (saving) intent = "savings";
  else if (buying) intent = "purchase";

  const toInvest = /(quero|vou|posso|devo|onde)\s+(investir|aplicar|colocar)/.test(t) && !/tenho/.test(t);

  return { intent, amount, installments, compare, food, toInvest };
}

interface Context {
  free: number;
  benefits: number;
  /** Média mensal de gastos lançados (dia a dia). */
  avgVariable: number;
  /** Quanto ainda deve sair do dia a dia até o fim do mês, pela média. */
  remainingVariable: number;
  /** Livre do mês descontando o dia a dia que ainda vem. */
  margin: number;
  /** Folga mínima para considerar que "cabe tranquilo". */
  cushion: number;
  months: { month: string; net: number }[];
  monthlyIncome: number;
  monthlyFixed: number;
  savingsBalance: number;
}

function context(data: FinanceData, today: string): Context {
  const s = summary(data, today);
  const proj = projection(data, today, 6);
  const avgVariable = averageVariableSpending(data, today);
  const benefitIds = new Set(data.accounts.filter((a) => a.type === "benefit").map((a) => a.id));
  const spentThisMonth = data.transactions
    .filter((t) => t.kind === "expense" && monthKey(t.date) === monthKey(today) && !benefitIds.has(t.account_id))
    .reduce((sum, t) => sum + t.amount, 0);
  const remainingVariable = Math.max(0, avgVariable - spentThisMonth);
  const monthlyIncome = proj[0]?.income ?? 0;
  return {
    free: s.free,
    benefits: s.benefits,
    avgVariable,
    remainingVariable,
    margin: s.free - remainingVariable,
    cushion: Math.max(30000, Math.round(monthlyIncome * 0.1)),
    months: proj.map((m) => ({ month: m.month, net: m.net - avgVariable })),
    monthlyIncome,
    monthlyFixed: proj[0]?.recurringExpenses ?? 0,
    savingsBalance: data.accounts.filter((a) => a.type === "savings").reduce((sum, a) => sum + a.balance, 0),
  };
}

const brl = formatBRL;
type Verdict = "Cabe tranquilo" | "Cabe, mas aperta" | "Melhor não agora";

function verdictFor(left: number, cushion: number): Verdict {
  if (left >= cushion) return "Cabe tranquilo";
  if (left >= 0) return "Cabe, mas aperta";
  return "Melhor não agora";
}

/** Sobra do mês mais apertado pagando `parcel` por `n` meses a partir do próximo. */
function installmentWorst(ctx: Context, parcel: number, n: number): { left: number; month: string } {
  let worst = { left: Infinity, month: "" };
  for (let i = 0; i < n; i++) {
    const m = ctx.months[Math.min(i, ctx.months.length - 1)];
    if (!m) break;
    const left = m.net - parcel;
    if (left < worst.left) worst = { left, month: m.month };
  }
  return worst;
}

/** Primeiro mês em que dá para pagar à vista guardando o que sobra até lá. */
function monthToAfford(ctx: Context, amount: number): string | null {
  let acc = ctx.margin;
  for (const m of ctx.months) {
    acc += m.net;
    if (acc - amount >= ctx.cushion) return m.month;
  }
  return null;
}

function purchase(data: FinanceData, today: string, q: ParsedQuestion): string {
  const ctx = context(data, today);
  const amount = q.amount;
  if (!amount) {
    return "Me diga o valor para eu fazer a conta. Por exemplo: **\"quero gastar R$ 400 num tênis\"** ou **\"celular de R$ 3.000 em 10x\"**.";
  }

  if (q.food && ctx.benefits >= amount) {
    return [
      "**Cabe tranquilo**, pagando com o benefício.",
      "",
      `- Seu saldo de VR/VA é ${brl(ctx.benefits)}; depois sobram ${brl(ctx.benefits - amount)}.`,
      `- O dinheiro livre do mês (${brl(ctx.free)}) fica intacto.`,
    ].join("\n");
  }

  const lines: string[] = [];
  const cashLeft = ctx.margin - amount;
  const cashVerdict = verdictFor(cashLeft, ctx.cushion);
  const n = q.installments;

  const dayToDay = ctx.avgVariable
    ? `- Reservei ${brl(ctx.remainingVariable)} para o dia a dia até o fim do mês (pela sua média de ${brl(ctx.avgVariable)}/mês).`
    : "- Ainda não há histórico de gastos do dia a dia; lance alguns gastos para a conta ficar mais precisa.";

  if (n && n > 1) {
    const parcel = Math.ceil(amount / n);
    const worst = installmentWorst(ctx, parcel, n);
    const instVerdict = verdictFor(worst.left, ctx.cushion);
    const last = ctx.months[Math.min(n, ctx.months.length) - 1];
    lines.push(`**${instVerdict}** em ${n}x de ${brl(parcel)}.`, "");
    lines.push(
      `- No mês mais apertado (${monthLabel(worst.month)}) sobram ${brl(worst.left)} depois da parcela e do dia a dia.`,
      `- A parcela ocupa ${n} meses${n > ctx.months.length ? `; olhei os próximos ${ctx.months.length} e repeti o último para os demais` : last ? `, até ${monthLabel(last.month)}` : ""}.`,
    );
    if (q.compare || cashVerdict !== "Melhor não agora") {
      lines.push(`- À vista: ${cashVerdict.toLowerCase()}, sobrando ${brl(cashLeft)} este mês.`);
      lines.push(
        cashVerdict === "Cabe tranquilo"
          ? "- Se tiver desconto à vista, pagar de uma vez libera os próximos meses."
          : "- Parcelado sem juros pesa menos agora; com juros, compare o total com o preço à vista.",
      );
    }
    lines.push(dayToDay);
    return lines.join("\n");
  }

  lines.push(`**${cashVerdict}**${q.compare ? " à vista" : ""}.`, "");
  lines.push(
    `- Livre até o fim do mês: ${brl(ctx.free)}.`,
    dayToDay,
    `- Depois da compra sobram ${brl(cashLeft)}.`,
  );

  if (cashVerdict === "Melhor não agora") {
    const when = monthToAfford(ctx, amount);
    lines.push(
      when
        ? `- Guardando o que sobra, dá para pagar à vista em **${monthLabel(when)}**.`
        : "- Nos próximos 6 meses a sobra não chega a esse valor sem apertar.",
    );
    const ending = activeInstallments(data, today).filter((p) => p.remaining <= 6)[0];
    if (ending) {
      lines.push(
        `- Em ${monthLabel(monthKey(ending.lastDate))} termina o parcelamento de ${ending.installment.description} e sobram mais ${brl(ending.parcelAmount)} por mês.`,
      );
    }
  }
  if (q.compare) {
    for (const k of [3, 6, 10]) {
      const parcel = Math.ceil(amount / k);
      const worst = installmentWorst(ctx, parcel, k);
      lines.push(`- Em ${k}x de ${brl(parcel)}: ${verdictFor(worst.left, ctx.cushion).toLowerCase()}.`);
    }
  }
  return lines.join("\n");
}

function monthlyCapacity(ctx: Context): number {
  if (!ctx.months.length) return 0;
  return Math.round(ctx.months.reduce((s, m) => s + m.net, 0) / ctx.months.length);
}

function savings(data: FinanceData, today: string): string {
  const ctx = context(data, today);
  const cap = monthlyCapacity(ctx);
  if (cap <= 0) {
    return [
      "**Hoje não sobra para guardar.**",
      "",
      `- Nos próximos meses, entradas menos fixos, parcelas e dia a dia dão em média ${brl(cap)} por mês.`,
      "- O caminho é cortar um fixo ou esperar um parcelamento terminar.",
    ].join("\n");
  }
  const first = ctx.months[0];
  const last = ctx.months[ctx.months.length - 1];
  const lines = [
    `**Dá para guardar cerca de ${brl(cap)} por mês.**`,
    "",
    `- É a média dos próximos ${ctx.months.length} meses: entradas menos fixos, parcelas e dia a dia${ctx.avgVariable ? ` (${brl(ctx.avgVariable)}/mês)` : ""}.`,
  ];
  if (last && first && last.net - first.net >= 5000) {
    lines.push(`- Começa em ${brl(first.net)} e sobe para ${brl(last.net)} em ${monthLabel(last.month)}, quando parcelamentos terminam.`);
  }
  if (!ctx.avgVariable) lines.push("- Sem histórico do dia a dia, esse valor está otimista. Lance seus gastos por um mês.");
  lines.push("- Uma regra simples: separe o valor no dia em que o salário cai, antes de gastar.");
  return lines.join("\n");
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function investment(data: FinanceData, today: string, q: ParsedQuestion): string {
  const ctx = context(data, today);
  const p = portfolioSummary(data);
  const cap = monthlyCapacity(ctx);
  const monthlyCost = ctx.monthlyFixed + ctx.avgVariable;
  const target = monthlyCost * 6;
  const citedHolding = q.amount != null && !q.toInvest;
  const reserve = citedHolding ? q.amount! : p.emergencyReserve;
  const toAllocate = q.toInvest ? q.amount : null;
  const lines: string[] = [];

  if (monthlyCost === 0) {
    return "Cadastre seus gastos fixos e lance alguns gastos do dia a dia; com isso eu calculo o tamanho da sua reserva de emergência e quanto dá para investir por mês.";
  }

  if (reserve < target) {
    const missing = target - reserve;
    const months = cap > 0 ? Math.ceil(missing / cap) : null;
    lines.push(
      toAllocate
        ? `**Coloque os ${brl(toAllocate)} na reserva de emergência.**`
        : "**Prioridade: completar a reserva de emergência.**",
      "",
    );
    lines.push(
      `- Reserva ideal: 6 meses do seu custo (${brl(monthlyCost)}/mês) = ${brl(target)}.`,
      citedHolding
        ? `- Com os ${brl(reserve)} que você citou, faltam ${brl(missing)}.`
        : `- Você tem ${brl(reserve)} na reserva (poupança e investimentos marcados como reserva); faltam ${brl(missing)}.`,
      months
        ? `- Guardando ${brl(cap)} por mês, completa em cerca de ${months} ${months === 1 ? "mês" : "meses"}.`
        : "- Hoje não sobra dinheiro por mês para completar; veja onde cortar primeiro.",
      "- Para a reserva, use algo com liquidez diária e baixo risco: Tesouro Selic ou CDB com liquidez diária que pague pelo menos 100% do CDI.",
    );
    const variable = Math.round(p.current * p.variableShare);
    if (variable > 0) {
      lines.push(`- Você já tem ${brl(variable)} em renda variável. Não precisa vender, mas os próximos aportes rendem mais segurança na reserva.`);
    }
  } else {
    lines.push(
      toAllocate
        ? `**Sua reserva está completa: os ${brl(toAllocate)} podem ir para metas maiores.**`
        : "**Sua reserva de emergência está completa.** Dá para pensar em metas maiores.",
      "",
    );
    lines.push(`- Reserva: ${brl(reserve)} para uma meta de ${brl(target)} (6 meses de custo).`);
    if (p.current > 0) {
      const top = p.byKind.slice(0, 3).map((k) => `${INVESTMENT_KIND_LABEL[k.kind].split(" (")[0]} ${pct(k.share)}`);
      lines.push(
        `- Carteira: ${brl(p.current)}${p.gainRatio != null ? ` (${p.gain >= 0 ? "+" : ""}${pct(p.gainRatio)} sobre o aplicado)` : ""}; ${top.join(", ")}.`,
      );
    }
    if (cap > 0 && !toAllocate) lines.push(`- Por mês dá para investir cerca de ${brl(cap)}.`);

    const crypto = p.byKind.find((k) => k.kind === "crypto");
    if (p.current > 0 && p.variableShare > 0.5) {
      lines.push(`- ${pct(p.variableShare)} da carteira está em renda variável. Para equilibrar, mande os próximos aportes para renda fixa.`);
    } else if (crypto && crypto.share > 0.1) {
      lines.push(`- Cripto já é ${pct(crypto.share)} da carteira; acima de 10% o risco de grandes quedas pesa. Prefira outros tipos nos próximos aportes.`);
    } else if (p.byPurpose.long_term === 0) {
      lines.push("- Ainda não há nada para o longo prazo. Tesouro IPCA+ longo protege da inflação e é um bom começo.");
    } else if (p.current > 0 && p.variableShare === 0) {
      lines.push("- A carteira está toda em renda fixa. Se o prazo for longo e você aceitar oscilação, uma parte pequena (10% a 20%) em fundos de índice de ações pode render mais.");
    } else {
      lines.push(
        "- Metas de 1 a 5 anos: renda fixa com prazo parecido (CDB, Tesouro prefixado ou IPCA+).",
        "- Longo prazo: Tesouro IPCA+ longo e, se aceitar oscilação, fundos de índice de ações.",
      );
    }
    if (reserve > target * 1.5) {
      lines.push(`- A reserva passou bastante da meta; uns ${brl(reserve - target)} poderiam ir para metas de prazo maior.`);
    }
  }
  if (data.investments.length === 0) lines.push("- Cadastre seus investimentos na aba Investimentos para eu considerar a carteira.");
  lines.push("", "São orientações gerais, não recomendação de investimento.");
  return lines.join("\n");
}

const HELP = [
  "Ainda não entendi essa pergunta. Eu sei responder coisas como:",
  "",
  "- **\"Quero gastar R$ 400 num tênis, cabe?\"**",
  "- **\"Celular de R$ 3.000 em 10x ou à vista?\"**",
  "- **\"Quanto consigo guardar por mês?\"**",
  "- **\"Como planejar meus investimentos?\"**",
].join("\n");

export function answer(data: FinanceData, today: string, question: string): string {
  if (data.accounts.length === 0) return "Cadastre suas contas primeiro; sem saldo não consigo fazer as contas.";
  const q = parseQuestion(question);
  switch (q.intent) {
    case "purchase":
      return purchase(data, today, q);
    case "savings":
      return savings(data, today);
    case "investment":
      return investment(data, today, q);
    default:
      return HELP;
  }
}
