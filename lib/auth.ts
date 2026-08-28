import { cookies } from "next/headers";

export const COOKIE = "efl_session";
const enc = new TextEncoder();
export const DEFAULT_DOMAIN = "edwardsfamilylaw.com";

export type Session = { email: string; name: string; picture?: string; exp: number };

function b64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signSession(p: Session): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return body + "." + b64url(sig);
}
export async function readSession(token?: string | null): Promise<Session | null> {
  try {
    if (!token || token.indexOf(".") < 0) return null;
    const p = token.split(".");
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(p[1]), enc.encode(p[0]));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(fromB64url(p[0])));
    if (!d.exp || Date.now() > d.exp) return null;
    return d as Session;
  } catch { return null; }
}
export async function getSession(): Promise<Session | null> {
  try { const jar = await cookies(); return await readSession(jar.get(COOKIE)?.value); } catch { return null; }
}
export function allowedDomains(): string[] {
  return (process.env.ALLOWED_DOMAINS || DEFAULT_DOMAIN).split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}
export function allowedEmail(email: string): boolean {
  const e = (email || "").toLowerCase();
  const extras = (process.env.ALLOWED_EMAILS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (extras.indexOf(e) >= 0) return true;
  return allowedDomains().indexOf(e.split("@")[1] || "") >= 0;
}
export function apiKeyOk(req: Request): boolean {
  const token = process.env.API_TOKEN;
  if (!token) return false;
  const given = req.headers.get("x-api-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!given && given === token;
}
export async function authorize(req: Request): Promise<Session | null> {
  if (apiKeyOk(req)) return { email: "automation@efl", name: "Automation", exp: Date.now() + 60000 };
  return await getSession();
}
export function reqOrigin(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-proto") || "https") + "://" + (h.get("x-forwarded-host") || h.get("host") || "");
}
