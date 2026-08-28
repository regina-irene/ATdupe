import { NextResponse } from "next/server";
import { reqOrigin, COOKIE } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const res = NextResponse.redirect((process.env.APP_URL || reqOrigin(req)) + "/");
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
