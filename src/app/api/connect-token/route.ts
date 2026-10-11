import { PluggyClient } from "pluggy-sdk";
import { errorResponse, guard, json } from "../bancos/shared";

/**
 * Cria um Connect Token da Pluggy no servidor, para o navegador abrir o Pluggy Connect sem nunca
 * ver PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET. Só para quem está logado.
 */
export async function POST(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data } = await db.auth.getUser(token);

  const pluggy = new PluggyClient({
    clientId: process.env.PLUGGY_CLIENT_ID!,
    clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
  });

  try {
    // O primeiro parâmetro é o itemId (para atualizar uma conexão existente); aqui é uma nova.
    const { accessToken } = await pluggy.createConnectToken(undefined, {
      // Liga as conexões criadas ao usuário do app, para achar depois.
      clientUserId: data.user?.id,
    });
    return json({ accessToken });
  } catch (e) {
    return errorResponse(e);
  }
}
