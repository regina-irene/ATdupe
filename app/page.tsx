import { getSession } from "../lib/auth";
import { dbUrl } from "../lib/db";
import SetupNotice from "./SetupNotice";
import Nav from "./Nav";
import Board from "./Board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const missing: string[] = [];
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!dbUrl()) missing.push("DATABASE_URL");
  if (missing.length) return <SetupNotice missing={missing} />;

  const session = await getSession();
  if (!session) {
    return (<><Nav /><div className="wrap"><div className="signin"><div className="card" data-tone="list">
      <h1>Chambers</h1>
      <p className="muted small">Sign in with your Edwards Family Law Google account.</p>
      <p><a className="btn primary" href="/api/auth/login">Sign in with Google</a></p>
    </div></div></div></>);
  }
  return (<><Nav name={session.name} /><Board me={{ name: session.name, email: session.email }} aiOn={!!process.env.ANTHROPIC_API_KEY} /></>);
}
