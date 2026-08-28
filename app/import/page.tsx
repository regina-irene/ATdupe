import { getSession } from "../../lib/auth";
import Nav from "../Nav";
import Wipe from "./Wipe";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session) return (<><Nav /><div className="wrap narrow"><div className="card" data-tone="load"><p><a className="btn primary" href="/api/auth/login">Sign in with Google</a></p></div></div></>);
  return (
    <>
      <Nav name={session.name} />
      <div className="wrap narrow">
        <div className="card" data-tone="load">
          <h2>Loading data</h2>
          <p className="small">Everything comes from Airtable through the API now. Go to <a href="/setup">Setup</a> and use <b>Full backfill</b> to read the whole Time table, or <b>Sync now</b> to pick up recent changes. Both link every entry to its Airtable record, so nothing duplicates.</p>
        </div>
        <Wipe />
      </div>
    </>
  );
}
