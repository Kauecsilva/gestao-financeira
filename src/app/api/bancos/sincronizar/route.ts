import { syncConnection, type BankConnection } from "@/lib/pluggy";
import { errorResponse, guard, json } from "../shared";

// Ao abrir o app a sincronização é automática, mas no máximo uma vez por hora.
const AUTO_INTERVAL = 60 * 60 * 1000;

/** Atualiza saldos e traz lançamentos novos de todos os bancos conectados. */
export async function POST(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  const body = (await request.json().catch(() => null)) as { auto?: unknown } | null;
  const auto = body?.auto === true;

  const { data, error } = await db.from("bank_connections").select("id, item_id, name, ignored_accounts, last_synced_at");
  if (error) return errorResponse(error);

  const due = (data as BankConnection[]).filter(
    (c) => !auto || !c.last_synced_at || Date.now() - new Date(c.last_synced_at).getTime() > AUTO_INTERVAL,
  );
  const total = { synced: 0, accounts: 0, imported: 0, errors: [] as string[] };
  for (const conn of due) {
    try {
      const r = await syncConnection(db, conn);
      total.synced++;
      total.accounts += r.accounts;
      total.imported += r.imported;
    } catch (e) {
      const res = errorResponse(e);
      const { error } = (await res.json()) as { error: string };
      total.errors.push(`${conn.name || "Banco"}: ${error}`);
    }
  }
  return json(total);
}
