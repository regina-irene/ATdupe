import { NextResponse } from "next/server";
import { ensureSchema, lastSyncs } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// When each board last synced, keyed the same way the sync routes are:
// time, tasks, payments, status, clients, or b:<baseId>:<tableId>.
export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ last: {} }, { status: 401 });
  try {
    await ensureSchema();
    return NextResponse.json({ last: await lastSyncs() });
  } catch (e: any) {
    return NextResponse.json({ last: {}, error: e.message });
  }
}
