import { NextResponse } from "next/server";
import { reqOrigin, allowedDomains } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "GOOGLE_CLIENT_ID is not set" }, { status: 500 });
  const origin = process.env.APP_URL || reqOrigin(req);
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: origin + "/api/auth/callback", response_type: "code",
    scope: "openid email profile", access_type: "online", prompt: "select_account", state,
  });
  const domains = allowedDomains();
  if (domains.length === 1) params.set("hd", domains[0]);
  const res = NextResponse.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
  res.cookies.set("efl_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
