import { accountName, accountTypeOf, toCents } from "@/lib/bank-sync";
import { fetchAccounts, fetchItem } from "@/lib/pluggy";
import { errorResponse, fail, guard, isItemId, json } from "../shared";

/** Mostra as contas de um Item ID antes de conectar, para o usuário escolher o que fazer com cada uma. */
export async function POST(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  const body = (await request.json().catch(() => null)) as { itemId?: unknown } | null;
  if (!isItemId(body?.itemId)) return fail("Item ID inválido. Ele tem o formato 1a2b3c4d-....", 400);

  try {
    const itemId = body.itemId.trim();
    const [item, accounts] = await Promise.all([fetchItem(itemId), fetchAccounts(itemId)]);
    return json({
      name: item.connector.name,
      lastUpdatedAt: item.lastUpdatedAt,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: accountName(item.connector.name, a),
        type: accountTypeOf(a),
        balance: toCents(a.balance),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
