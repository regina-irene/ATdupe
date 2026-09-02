import { dbUrl, q, ensureSchema } from "../../lib/db";
import { getSession } from "../../lib/auth";
import Nav from "../Nav";
import SyncPanel from "./SyncPanel";

export const dynamic = "force-dynamic";

async function dbStatus() {
  if (!dbUrl()) return { ok: false, note: "DATABASE_URL is not set" };
  try {
    await ensureSchema();
    const a = await q("select count(*)::int as n from time_entries");
    const b = await q("select count(*)::int as n from cases");
    const c = await q("select count(*)::int as n from tasks");
    return { ok: true, note: `${Number(a[0].n).toLocaleString()} time entries, ${Number(c[0].n).toLocaleString()} tasks, ${Number(b[0].n).toLocaleString()} cases` };
  } catch (e: any) { return { ok: false, note: e.message }; }
}

function Row({ ok, label, note }: { ok: boolean; label: string; note?: string }) {
  return (<tr><td style={{ width: 26 }}>{ok ? "✓" : "—"}</td><td><b>{label}</b>{note ? <div className="muted small">{note}</div> : null}</td></tr>);
}

export default async function Page() {
  const session = await getSession();
  const dbs = await dbStatus();
  return (
    <>
      <Nav name={session?.name} />
      <div className="wrap narrow">
        <div className="card" data-tone="status">
          <h2>Status</h2>
          <table className="data"><tbody>
            <Row ok={!!process.env.AUTH_SECRET} label="AUTH_SECRET" />
            <Row ok={!!process.env.GOOGLE_CLIENT_ID} label="GOOGLE_CLIENT_ID" />
            <Row ok={!!process.env.GOOGLE_CLIENT_SECRET} label="GOOGLE_CLIENT_SECRET" />
            <Row ok={dbs.ok} label="Database" note={dbs.note} />
            <Row ok={!!process.env.AIRTABLE_TOKEN} label="AIRTABLE_TOKEN" note="Needs data.records:read and data.records:write on this base." />
            <Row ok={!!process.env.ANTHROPIC_API_KEY} label="ANTHROPIC_API_KEY" note={"Powers Make billing ready. Model: " + (process.env.ANTHROPIC_MODEL || "claude-sonnet-5") + "."} />
            <Row ok={!!process.env.API_TOKEN} label="API_TOKEN" note="Optional. Only for outside automations posting entries." />
            <Row ok={!!process.env.APP_URL} label="APP_URL" note={"Pins the sign-in address. Currently " + (process.env.APP_URL || "not set, so the address of whatever host you arrive on is used.")} />
          </tbody></table>
        </div>

        <div className="card" data-tone="info">
          <h2>Sign-in address</h2>
          <p className="small" style={{ marginTop: 0 }}>
            Google will only accept a sign-in that comes back to an address you have registered on the
            OAuth client. This exact string has to appear under <b>Authorised redirect URIs</b> at
            {" "}<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">console.cloud.google.com/apis/credentials</a>:
          </p>
          <pre>{(process.env.APP_URL || "https://chambers.edwardsfamilylaw.com") + "/api/auth/callback"}</pre>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Keep the old vercel.app one registered as well so both addresses keep working. If sign-in fails
            with &quot;this app&apos;s request is invalid&quot;, that means the address the app sent is not on
            the list. <a href="/api/health" target="_blank" rel="noreferrer">Check what it is actually sending</a>.
          </p>
        </div>

        <SyncPanel />

        <div className="card" data-tone="info">
          <h2>How syncing works</h2>
          <ul className="small">
            <li><b>Time</b> syncs every 15 minutes, <b>Tasks</b> on the quarter hour just after.</li>
            <li>Entries and tasks your Airtable automations create are pulled in, including the case name, user and status those automations fill in afterward.</li>
            <li>Anything you type or change here is written back to Airtable, where your automations still run on it.</li>
            <li>Only time dated within the last {process.env.SYNC_WINDOW_DAYS || 60} days is written to Airtable, so deleting old Airtable rows never makes them reappear.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
