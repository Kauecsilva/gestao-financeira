import type { SupabaseClient } from "@supabase/supabase-js";
import { PluggyError, pluggyConfigured } from "@/lib/pluggy";
import { userDb } from "@/lib/user-db";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export const fail = (error: string, status: number) => json({ error }, status);

/** Confere a configuração e o login; devolve o banco do usuário ou a resposta de erro. */
export async function guard(request: Request): Promise<SupabaseClient | Response> {
  if (!pluggyConfigured()) {
    return fail("A conexão com bancos ainda não foi configurada: faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor.", 503);
  }
  return (await userDb(request)) ?? fail("Entre na sua conta para conectar bancos.", 401);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof PluggyError) return fail(error.message, error.status);
  console.error("bancos:", error);
  return fail("Não deu para falar com o banco agora. Tente de novo em instantes.", 500);
}

/** Item IDs da Pluggy são UUIDs. */
export const isItemId = (x: unknown): x is string =>
  typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.trim());
