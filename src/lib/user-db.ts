// Só no servidor: cliente do Supabase agindo como o usuário logado (o token vem do navegador),
// para que as regras de acesso (RLS) valham também nas rotas da API.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export async function userDb(request: Request): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anonKey || !token) return null;
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  return !error && data.user ? db : null;
}
