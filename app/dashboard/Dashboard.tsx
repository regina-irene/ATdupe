"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

const TASKS_URL = "https://portal.edwardsfamilylaw.com/admin/tasks";
const PORTAL_TASKS_URL = "https://clients.edwardsfamilylaw.com/admin/tasks";
const NOTES_URL = "https://clients.edwardsfamilylaw.com/admin/notes";
const REFRESH_MS = 5 * 60 * 1000;

const KIND: Record<string, [string, string]> = {
  objections: ["Objections", "k-objections"],
  review: ["Review", "k-review"],
  "docs-review": ["Docs", "k-docs"],
  "qa-item": ["Question", "k-question"],
  "qa-slot": ["Question", "k-question"],
  "qa-drfa": ["DRFA", "k-question"],
  "client-task": ["Portal", "k-task"],
};
const GLYPH: Record<string, string> = { note: "📌", message: "💬", file: "📎", task: "✅" };
const TYPES: [string, string][] = [["all", "All"], ["note", "Notes"], ["message", "Messages"], ["file", "Files"], ["task", "Tasks"]];

// Actual date and time, never "19h". The year appears only when it is not this one.
function stampOf(iso: string) {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  const sameYear = t.getFullYear() === new Date().getFullYear();
  const date = t.toLocaleDateString([], sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
  return date + ", " + t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
const fullStamp = (iso: string) => {
  const t = new Date(iso);
  return isNaN(t.getTime()) ? "" : t.toLocaleString();
};
function dayLabel(iso: string) {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "Earlier";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  const date = t.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  if (diff <= 0) return "Today · " + date;
  if (diff === 1) return "Yesterday · " + date;
  if (diff < 7) return t.toLocaleDateString([], { weekday: "long" }) + " · " + date;
  return date;
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => { try { setFilter(localStorage.getItem("efl_activity_filter") || "all"); } catch {} }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const headers: any = {};
      try { const k = localStorage.getItem("efl_tasks_feed_key"); if (k) headers["x-feed-key"] = k; } catch {}
      const r = await fetch("/api/feeds", { headers, cache: "no-store" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  function saveKey() {
    const k = keyInput.trim();
    if (!k) return;
    try { localStorage.setItem("efl_tasks_feed_key", k); } catch {}
    setKeyInput(""); load();
  }

  const tasks: any[] = data?.tasks || [];
  const activity: any[] = data?.activity || [];
  const shown = useMemo(() => (filter === "all" ? activity : activity.filter((i) => i.type === filter)), [activity, filter]);

  const grouped = useMemo(() => {
    const out: { day: string; items: any[] }[] = [];
    for (const i of shown) {
      const d = dayLabel(i.at);
      const last = out[out.length - 1];
      if (last && last.day === d) last.items.push(i);
      else out.push({ day: d, items: [i] });
    }
    return out;
  }, [shown]);

  const needKey = data?.needKey || data?.badKey;

  return (
    <div className="wrap">
      {err ? <div className="notice err">{err}</div> : null}

      {needKey ? (
        <div className="card" data-tone="danger">
          <h2>Feed key needed</h2>
          <p className="small" style={{ marginTop: 0 }}>
            {data?.badKey ? "The key was rejected by both feeds." : "No feed key is set on the server."} Add
            <code>FEED_KEY</code> to this project&apos;s environment variables in Vercel and redeploy, which sets it
            for everyone. Or paste it here to use it just in this browser.
          </p>
          <div className="row">
            <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Feed key" onKeyDown={(e) => { if (e.key === "Enter") saveKey(); }} style={{ maxWidth: 300 }} />
            <button className="btn primary sm" onClick={saveKey}>Use it here</button>
          </div>
        </div>
      ) : null}

      <div className="dash">
      <div className="card" data-tone="todo">
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats">
            <div className="stat"><b>{loading && !data ? "–" : tasks.length}</b><span>Open items</span></div>
            {(data?.sources || []).map((s: any) => (
              <div className="stat" key={s.name}>
                <b className={s.problem ? "hot" : ""}>{s.problem ? "!" : s.count}</b>
                <span>{s.name}{s.problem ? " · " + s.problem : ""}</span>
              </div>
            ))}
          </div>
          <div className="spacer" />
          <div className="row noprint">
            <button className="btn sm" disabled={loading} onClick={load}>{loading ? "Refreshing..." : "Refresh"}</button>
            <a className="btn sm" href={TASKS_URL} target="_blank" rel="noreferrer">FileFlow</a>
            <a className="btn sm" href={PORTAL_TASKS_URL} target="_blank" rel="noreferrer">Portal</a>
          </div>
        </div>
        <h2>To do</h2>
        {!tasks.length ? (
          <p className="muted small">{loading ? "Loading..." : needKey ? "Waiting on a feed key." : "All caught up. Nothing open."}</p>
        ) : (
          <div className="feed">
            {tasks.map((t, i) => {
              const kd = KIND[t.kind] || ["Task", "k-review"];
              return (
                <a className="feedrow" key={(t.id || "") + i} href={t.href || TASKS_URL} target="_blank" rel="noreferrer">
                  <span className={"tag " + kd[1]}>{kd[0]}</span>
                  <span className="feedmain">
                    <b>{t.title}</b>
                    <span className="muted small">
                      {t.matterName}{t.matterType ? " · " + t.matterType : ""}{t.detail ? " — " + t.detail : ""}
                    </span>
                  </span>
                  <span className="feedage" title={fullStamp(t.since)}>{stampOf(t.since)}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {data?.activityOk ? (
        <div className="card" data-tone="act">
          <div className="row" style={{ marginBottom: 9 }}>
            <div className="stats"><div className="stat"><b>{activity.length}</b><span>Portal activity</span></div></div>
            <div className="spacer" />
            <div className="row noprint">
              <div className="chips" style={{ marginTop: 0 }}>
                {TYPES.map(([id, label]) => (
                  <button key={id} className={"chip " + (filter === id ? "on" : "")}
                    onClick={() => { setFilter(id); try { localStorage.setItem("efl_activity_filter", id); } catch {} }}>
                    {label}
                  </button>
                ))}
              </div>
              <a className="btn sm" href={data.activityUrl || NOTES_URL} target="_blank" rel="noreferrer">Field Notes</a>
            </div>
          </div>
          <h2>Recent from the portal</h2>
          {!shown.length ? <p className="muted small">Nothing of that kind yet.</p> : (
            <div className="feed">
              {grouped.map((g) => (
                <div key={g.day}>
                  <div className="feedday">{g.day}</div>
                  {g.items.map((i, n) => (
                    <a className="feedrow" key={(i.id || "") + n} href={i.href || NOTES_URL} target="_blank" rel="noreferrer">
                      <span className="feedglyph">{GLYPH[i.type] || "•"}</span>
                      <span className="feedmain">
                        <b>{i.matterName}</b>
                        <span className="muted small">{i.actor ? i.actor + " · " : ""}{i.text}</span>
                      </span>
                      <span className="feedage" title={fullStamp(i.at)}>{stampOf(i.at)}</span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      </div>
    </div>
  );
}
