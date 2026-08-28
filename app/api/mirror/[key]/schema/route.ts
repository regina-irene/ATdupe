import { NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/db";
import { authorize } from "../../../../../lib/auth";
import { MIRRORS, schemaFor } from "../../../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    const cfg = MIRRORS[p.key];
    if (!cfg) return NextResponse.json({ error: "Unknown board" }, { status: 404 });
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const { fields, primary } = await schemaFor(p.key, force);
    return NextResponse.json({ label: cfg.label, singular: cfg.singular, primary, fields });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
