import { NextResponse } from "next/server";
import { signSession, allowedEmail, reqOrigin, COOKIE } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeJwt(token: string): any {
  const s = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return JSON.parse(decodeURIComponent(atob(s + pad).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
}

const fail = (o: string, w: string) => NextResponse.redirect(o + "/?error=" + encodeURIComponent(w));

export async function GET(req: Request) {
  const origin = process.env.APP_URL || reqOrigin(req);
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const cookieState = (req.headers.get("cookie") || "").split(";").map((c) => c.trim()).find((c) => c.startsWith("efl_state="));
  if (!code) return fail(origin, "No code returned from Google");
  if (!state || !cookieState || cookieState.split("=")[1] !== state) return fail(origin, "Sign-in expired, please try again");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "", redirect_uri: origin + "/api/auth/callback", grant_type: "authorization_code" }),
  });
  const tok = await r.json();
  if (!tok.id_token) return fail(origin, tok.error_description || tok.error || "Google sign-in failed");

  const claims = decodeJwt(tok.id_token);
  const email = (claims.email || "").toLowerCase();
  if (!claims.email_verified) return fail(origin, "Google account email is not verified");
  if (!allowedEmail(email)) return fail(origin, email + " is not authorized for this board");

  const token = await signSession({ email, name: claims.name || email, picture: claims.picture, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  const res = NextResponse.redirect(origin + "/");
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  res.cookies.set("efl_state", "", { path: "/", maxAge: 0 });
  return res;
}
