export default function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <>
      <div className="topbar"><div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/efl-logo.png" alt="Edwards Family Law" className="logo" width={26} height={26} />
        Chambers
      </div><nav /></div>
      <div className="pagebar" />
      <div className="wrap narrow"><div className="card" data-tone="status">
        <h3>Almost there</h3>
        <p className="muted">The app needs these environment variables:</p>
        <ul>{missing.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
        <p>Add them in Vercel under <b>Settings, Environment Variables</b>, then redeploy.</p>
      </div></div>
    </>
  );
}
