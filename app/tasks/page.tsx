import { getSession } from "../../lib/auth";
import Nav from "../Nav";
import Tasks from "./Tasks";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session) return (<><Nav /><div className="wrap narrow"><div className="card" data-tone="task"><p><a className="btn primary" href="/api/auth/login">Sign in with Google</a></p></div></div></>);
  return (<><Nav name={session.name} /><Tasks /></>);
}
