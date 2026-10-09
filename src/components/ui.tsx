"use client";

import { useEffect, useRef, useState } from "react";
import { centsToInput, formatBRL, parseBRL } from "@/lib/money";

export const uid = () => crypto.randomUUID();

export function Card({ title, action, children, className = "" }: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tabular whitespace-nowrap ${cents < 0 ? "text-bad" : ""} ${className}`}>{formatBRL(cents)}</span>;
}

export function Button({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-accent text-white",
    ghost: "border border-border",
    danger: "text-bad border border-border",
  }[variant];
  return <button className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60 ${styles} ${className}`} {...props} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2";

export function MoneyInput({ value, onChange, required }: {
  value: number | null;
  onChange: (cents: number | null) => void;
  required?: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : centsToInput(value));
  return (
    <input
      inputMode="decimal"
      placeholder="0,00"
      required={required}
      className={`${inputClass} tabular`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseBRL(e.target.value));
      }}
    />
  );
}

/** Folha que sobe de baixo no celular e vira caixa centralizada no PC. */
export function Sheet({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-2xl"
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Fechar" className="px-2 text-xl text-muted">×</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}
