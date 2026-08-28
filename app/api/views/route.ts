import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safe(s: any) { try { return JSON.parse(s); } catch { return {}; } }

// Saved filter sets, e.g. "RIE open". Shared across the firm on purpose:
// three people, and everyone benefits from the same shortcuts.
export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const page = new URL(req.url).searchParams.get("page") || "tasks";
    const rows = await q(
      "select id, name, params, owner_email, pos from saved_views where page = $1 order by pos nulls last, lower(name)",
      [page]
    );
    return NextResponse.json({ rows: rows.map((r: any) => ({ id: r.id, name: r.name, owner: r.owner_email, params: safe(r.params) })) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = await authorize(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const name = String(b.name || "").trim();
    if (!name) return NextResponse.json({ error: "Give the view a name." }, { status: 400 });
    if (name.length > 40) return NextResponse.json({ error: "Keep the name to 40 characters or fewer." }, { status: 400 });
    const page = String(b.page || "tasks");
    const params = JSON.stringify(b.params || {});
    const rows = await q(
      `insert into saved_views (page, name, params, owner_email, pos)
       values ($1,$2,$3,$4,(select coalesce(max(pos),0)+1 from saved_views where page = $1))
       on conflict (page, lower(name))
       do update set params = excluded.params, owner_email = excluded.owner_email, updated_at = now()
       returning id`,
      [page, name, params, s.email || null]
    );
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
