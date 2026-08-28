import { getSession } from "../../lib/auth";
import Nav from "../Nav";
import Reports from "./Reports";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session) return (<><Nav /><div className="wrap narrow"><div className="card" data-tone="report"><p><a className="btn primary" href="/api/auth/login">Sign in with Google</a></p></div></div></>);
  return (<><Nav name={session.name} /><Reports /></>);
}
