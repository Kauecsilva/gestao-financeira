import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { ASSISTANT_INSTRUCTIONS } from "@/lib/assistant-prompt";

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 30;
const MAX_CHARS = 60_000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Body {
  messages: ChatMessage[];
  snapshot: string;
}

function isBody(x: unknown): x is Body {
  const b = x as Body;
  return (
    !!b &&
    typeof b.snapshot === "string" &&
    Array.isArray(b.messages) &&
    b.messages.length > 0 &&
    b.messages.every((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string") &&
    b.messages[0].role === "user" &&
    b.messages.at(-1)?.role === "user"
  );
}

// Com Supabase configurado, só quem está logado usa o assistente (a chave da API é paga).
async function authorized(request: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return process.env.NODE_ENV !== "production" || process.env.ASSISTANT_ALLOW_ANONYMOUS === "true";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await createClient(url, anonKey).auth.getUser(token);
  return !error && !!data.user;
}

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return text("O assistente ainda não foi configurado: falta a variável ANTHROPIC_API_KEY no servidor.", 503);
  }
  if (!(await authorized(request))) return text("Entre na sua conta para usar o assistente.", 401);

  const body: unknown = await request.json().catch(() => null);
  if (!isBody(body)) return text("Requisição inválida.", 400);
  const messages = body.messages.slice(-MAX_MESSAGES);
  const size = body.snapshot.length + messages.reduce((n, m) => n + m.content.length, 0);
  if (size > MAX_CHARS) return text("A conversa ficou longa demais. Comece uma nova.", 413);

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: ASSISTANT_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
      { type: "text", text: `# Situação financeira atual do usuário\n\n${body.snapshot}` },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\nNão consegui responder a essa pergunta. Tente reformular."));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n(resposta cortada por ser longa demais)"));
        }
      } catch (error) {
        const msg =
          error instanceof Anthropic.RateLimitError
            ? "Muitas perguntas seguidas. Espere um pouco e tente de novo."
            : error instanceof Anthropic.AuthenticationError
              ? "A chave da API do Claude é inválida."
              : error instanceof Anthropic.APIError
                ? `Erro do assistente (${error.status ?? "rede"}). Tente de novo.`
                : "Erro inesperado no assistente.";
        controller.enqueue(encoder.encode(`\n\n${msg}`));
        console.error("assistente:", error);
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
