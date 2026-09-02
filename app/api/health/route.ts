import { NextResponse } from "next/server";
import { dbUrl, q } from "../../../lib/db";
import { reqOrigin } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let db = { ok: false, note: "DATABASE_URL is not set" };
  if (dbUrl()) {
    try { await q("select 1 as ok"); db = { ok: true, note: "connected" }; }
    catch (e: any) { db = { ok: false, note: e.message }; }
  }
  // The exact value Google must have under Authorised redirect URIs. When
  // sign-in fails with "this app's request is invalid", it is because the
  // string below is not registered on the OAuth client.
  const origin = process.env.APP_URL || reqOrigin(req);
  return NextResponse.json({
    ok: true, db,
    sign_in: {
      origin,
      redirect_uri: origin + "/api/auth/callback",
      pinned_by_APP_URL: !!process.env.APP_URL,
      seen_host: reqOrigin(req),
    },
    env: {
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      DATABASE_URL: !!dbUrl(),
      AIRTABLE_TOKEN: !!process.env.AIRTABLE_TOKEN,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      API_TOKEN: !!process.env.API_TOKEN,
      APP_URL: !!process.env.APP_URL,
    },
  });
}
