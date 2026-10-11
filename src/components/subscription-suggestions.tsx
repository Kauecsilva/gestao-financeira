"use client";

import { useMemo, useState } from "react";
import { today } from "@/lib/dates";
import { detectSubscriptions, toRecurring, type SubscriptionSuggestion } from "@/lib/subscriptions";
import { useFinance } from "./finance-provider";
import { Button, Card, Money, uid } from "./ui";

const DISMISSED_KEY = "gestao-financeira:assinaturas-ignoradas";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Cobranças mensais achadas nos lançamentos que ainda não estão em Compromissos. */
export function SubscriptionSuggestions() {
  const { data, save } = useFinance();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [busy, setBusy] = useState(false);
  const now = today();

  const suggestions = useMemo(
    () => detectSubscriptions(data, now).filter((s) => !dismissed.includes(s.key)),
    [data, now, dismissed],
  );
  if (suggestions.length === 0) return null;

  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";

  async function add(list: SubscriptionSuggestion[]) {
    setBusy(true);
    try {
      for (const s of list) await save("recurring", toRecurring(s, uid()));
    } finally {
      setBusy(false);
    }
  }

  function dismiss(s: SubscriptionSuggestion) {
    const next = [...dismissed, s.key];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Sem armazenamento no navegador, só some até recarregar.
    }
  }

  return (
    <Card
      title="Assinaturas encontradas"
      className="mb-4"
      action={suggestions.length > 1 && <Button variant="ghost" disabled={busy} onClick={() => add(suggestions)}>Adicionar todas</Button>}
    >
      <p className="mb-2 text-xs text-muted">
        Cobranças que se repetem todo mês nos seus lançamentos. Adicione para elas entrarem no que já está comprometido.
      </p>
      <ul className="divide-y divide-border">
        {suggestions.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate">{s.description}</p>
              <p className="text-xs text-muted">
                Todo dia {s.day_of_month} · {accountName(s.account_id)}
                {s.months > 1 ? ` · ${s.months} meses seguidos` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Money cents={-s.amount} />
              <Button disabled={busy} onClick={() => add([s])}>Adicionar</Button>
              <button onClick={() => dismiss(s)} aria-label={`Ignorar ${s.description}`} className="px-1 text-muted">×</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
