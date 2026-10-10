import { describe, expect, it } from "vitest";
import { formatBRL, parseBRL } from "./money";

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    ["R$ 10", 1000],
    ["10,5", 1050],
  ])("%s → %i centavos", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it("rejeita texto inválido", () => {
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("")).toBeNull();
  });
});

describe("formatBRL", () => {
  it("formata em reais", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
});
