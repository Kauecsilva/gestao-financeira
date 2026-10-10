"use client";

import { useEffect, useRef, useState } from "react";
import { useFinance } from "@/components/finance-provider";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { Button, PageHeader } from "@/components/ui";
import { today } from "@/lib/dates";
import { buildSnapshot } from "@/lib/snapshot";
import { supabase } from "@/lib/store";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Quero comprar um tênis de R$ 400. Cabe no meu bolso agora?",
  "Vale mais a pena parcelar um celular de R$ 3.000 em 10x ou esperar e pagar à vista?",
  "Quanto consigo guardar por mês sem apertar?",
  "Tenho R$ 5.000 na poupança. Como planejar meus próximos investimentos?",
];

export default function Assistente() {
  const { data } = useFinance();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: Message[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const appendToAnswer = (chunk: string) =>
      setMessages((cur) => {
        const last = cur[cur.length - 1];
        return [...cur.slice(0, -1), { ...last, content: last.content + chunk }];
      });

    try {
      const session = await supabase()?.auth.getSession();
      const token = session?.data.session?.access_token;
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ messages: history, snapshot: buildSnapshot(data, today()) }),
      });
      if (!res.ok || !res.body) {
        appendToAnswer(await res.text().catch(() => "Não foi possível falar com o assistente."));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        appendToAnswer(decoder.decode(value, { stream: true }));
      }
    } catch {
      appendToAnswer("Sem conexão com o assistente. Verifique sua internet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <PageHeader
        title="Assistente"
        action={messages.length > 0 && <Button variant="ghost" disabled={busy} onClick={() => setMessages([])}>Nova conversa</Button>}
      />

      <div className="flex-1 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Pergunte se um gasto cabe no seu momento ou peça ajuda para planejar. O assistente olha seus saldos,
              compromissos e parcelamentos antes de responder.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-2xl border border-border bg-surface p-3 text-left text-sm">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2 text-sm text-white"
                  : "max-w-[95%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm leading-relaxed"
              }
            >
              {m.role === "assistant" ? (
                m.content ? <SimpleMarkdown text={m.content} /> : <span className="text-muted">Analisando suas finanças…</span>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-20 mt-4 flex gap-2 rounded-2xl border border-border bg-surface p-2 md:bottom-4"
      >
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Ex.: R$ 250 num jantar, é uma boa?"
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
        />
        <Button disabled={busy || !input.trim()}>Enviar</Button>
      </form>
    </div>
  );
}
