"use client";

import { useState } from "react";
import { monthLabel } from "@/lib/dates";
import type { MonthProjection } from "@/lib/finance";
import { formatBRL } from "@/lib/money";

// Barras do "livre acumulado" mês a mês, com zero como base (negativo desce).
export function ProjectionChart({ months }: { months: MonthProjection[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = months.map((m) => m.projectedFree);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const H = 160;
  const zeroY = (max / span) * H;
  const shown = hover ?? months.length - 1;

  return (
    <div>
      <div className="mb-2 h-10 text-sm" aria-live="polite">
        <span className="text-muted">Livre ao fim de {monthLabel(months[shown].month)}: </span>
        <span className={`tabular font-semibold ${months[shown].projectedFree < 0 ? "text-bad" : ""}`}>
          {formatBRL(months[shown].projectedFree)}
        </span>
        <span className="block text-xs text-muted">
          Saldo do mês {months[shown].net >= 0 ? "+" : ""}
          {formatBRL(months[shown].net)}
        </span>
      </div>
      <div className="relative" style={{ height: H }} role="img" aria-label="Projeção do dinheiro livre nos próximos meses">
        <div className="absolute inset-x-0 border-t border-muted/40" style={{ top: zeroY }} />
        <div className="absolute inset-0 grid gap-1" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((m, i) => {
            const h = (Math.abs(m.projectedFree) / span) * H;
            const neg = m.projectedFree < 0;
            return (
              <button
                key={m.month}
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setHover(i)}
                className="relative h-full"
                aria-label={`${monthLabel(m.month)}: ${formatBRL(m.projectedFree)}`}
              >
                <span
                  className={`absolute inset-x-[18%] ${neg ? "rounded-b bg-bad" : "rounded-t bg-accent"} ${hover === i || (hover === null && i === shown) ? "opacity-100" : "opacity-60"}`}
                  style={neg ? { top: zeroY, height: Math.max(h, 2) } : { top: zeroY - Math.max(h, 2), height: Math.max(h, 2) }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1 grid gap-1 text-center text-xs text-muted" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
        {months.map((m) => (
          <span key={m.month}>{monthLabel(m.month)}</span>
        ))}
      </div>
    </div>
  );
}
