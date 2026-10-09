const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Converte "1.234,56", "1234.56", "R$ 10" etc. em centavos. Retorna null se inválido. */
export function parseBRL(input: string): number | null {
  let s = input.replace(/[R$\s]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma !== -1) {
    s = s.replace(/,/g, "");
  } else if (lastDot !== -1 && s.length - lastDot - 1 === 3) {
    // Só pontos e 3 dígitos no fim: no Brasil é separador de milhar ("1.234").
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
