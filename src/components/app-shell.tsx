"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFinance } from "./finance-provider";

const NAV = [
  { href: "/", label: "Painel", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { href: "/contas", label: "Contas", icon: "M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2" },
  { href: "/lancamentos", label: "Lançamentos", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/compromissos", label: "Compromissos", icon: "M7 3v3m10-3v3M4 8h16M5 5h14v15H5z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { mode, error, signOut } = useFinance();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-border p-4 md:flex">
        <p className="mb-4 px-2 font-semibold">Gestão Financeira</p>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${active(n.href) ? "bg-accent-soft/50 font-medium" : "text-muted"}`}
          >
            <Icon d={n.icon} />
            {n.label}
          </Link>
        ))}
        <div className="mt-auto space-y-2 px-2 text-xs text-muted">
          {mode === "local" ? (
            <p>Modo local: os dados ficam só neste navegador.</p>
          ) : (
            <button onClick={signOut} className="underline">Sair</button>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10">
        {mode === "local" && (
          <p className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted md:hidden">
            Modo local: os dados ficam só neste navegador.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-bad px-3 py-2 text-sm text-bad">
            Não foi possível salvar: {error}
          </p>
        )}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active(n.href) ? "text-accent" : "text-muted"}`}
          >
            <Icon d={n.icon} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
