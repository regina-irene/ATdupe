import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const list = async (col: string) =>
  (await q(`select distinct ${col} as v from payments where ${col} is not null and ${col}::text <> '' order by 1`))
    .map((r: any) => r.v);

// Options come from the data, so they always match Airtable's select choices.
export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    return NextResponse.json({
      kinds: await list("kind"),
      methods: await list("method"),
      types: await list("case_type"),
      cleared: await list("cleared"),
      years: await list("year"),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
