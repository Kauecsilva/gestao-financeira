import { syncConnection, type BankConnection, type Links } from "@/lib/pluggy";
import { errorResponse, fail, guard, isItemId, json } from "./shared";

const COLUMNS = "id, item_id, name, ignored_accounts, last_synced_at";

/** Bancos conectados. */
export async function GET(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  const { data, error } = await db.from("bank_connections").select(COLUMNS).order("created_at");
  if (error) return errorResponse(error);
  return json({ connections: data });
}

/** Conecta um banco (Item ID da Pluggy) e faz a primeira sincronização. */
export async function POST(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  const body = (await request.json().catch(() => null)) as { itemId?: unknown; links?: unknown } | null;
  if (!isItemId(body?.itemId)) return fail("Item ID inválido.", 400);
  const links: Links = {};
  if (body.links && typeof body.links === "object") {
    for (const [k, v] of Object.entries(body.links)) if (typeof v === "string") links[k] = v;
  }

  const itemId = body.itemId.trim();
  const { data, error } = await db
    .from("bank_connections")
    .upsert({ item_id: itemId }, { onConflict: "user_id,item_id" })
    .select(COLUMNS)
    .single();
  if (error) return errorResponse(error);

  try {
    return json(await syncConnection(db, data as BankConnection, links));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Desconecta. As contas e lançamentos já trazidos continuam no app. */
export async function DELETE(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return fail("Requisição inválida.", 400);
  const { error } = await db.from("bank_connections").delete().eq("id", body.id);
  if (error) return errorResponse(error);
  return json({ ok: true });
}
