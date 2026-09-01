import { NextResponse } from "next/server";
import { ensureSchema, getState, setState } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "gal_sheet_url";
const DEFAULT_URL =
  process.env.GAL_SHEET_URL ||
  "https://docs.google.com/spreadsheets/d/1vnsl3jkM9MUk_csTJBeFT0goGpQ4XNxnDPlVDMccsLo/edit?gid=2121299249#gid=2121299249";

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    return NextResponse.json({ url: (await getState(KEY)) || DEFAULT_URL });
  } catch (e: any) {
    return NextResponse.json({ url: DEFAULT_URL, note: e.message });
  }
}

// Shared, so changing the sheet changes it for everyone.
export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const url = String(b.url || "").trim();
    if (!url) { await setState(KEY, null); return NextResponse.json({ ok: true, url: DEFAULT_URL }); }
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(url))
      return NextResponse.json({ error: "That does not look like a Google Sheets link." }, { status: 400 });
    await setState(KEY, url);
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
