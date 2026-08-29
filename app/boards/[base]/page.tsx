import { getSession } from "../../../lib/auth";
import Nav from "../../Nav";
import BoardDetail from "./BoardDetail";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ base: string }> }) {
  const session = await getSession();
  const p = await params;
  if (!session) return (<><Nav /><div className="wrap narrow"><div className="card" data-tone="board"><p><a className="btn primary" href="/api/auth/login">Sign in with Google</a></p></div></div></>);
  return (<><Nav name={session.name} /><BoardDetail base={p.base} /></>);
}
