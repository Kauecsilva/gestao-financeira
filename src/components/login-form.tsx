"use client";

import { useState } from "react";
import { supabase } from "@/lib/store";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const db = supabase();
    if (!db) return;
    setBusy(true);
    setMessage(null);
    const { error, data } = creating
      ? await db.auth.signUp({ email, password })
      : await db.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (creating && !data.session) setMessage("Conta criada. Confirme pelo link enviado ao seu e-mail.");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <h1 className="text-xl font-semibold">Gestão Financeira</h1>
          <p className="text-sm text-muted">{creating ? "Crie sua conta" : "Entre para ver suas finanças"}</p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm">E-mail</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Senha</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={creating ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        {message && <p className="text-sm text-muted">{message}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-white disabled:opacity-60">
          {creating ? "Criar conta" : "Entrar"}
        </button>
        <button type="button" onClick={() => setCreating(!creating)} className="w-full text-sm text-accent">
          {creating ? "Já tenho conta" : "Criar uma conta"}
        </button>
      </form>
    </main>
  );
}
