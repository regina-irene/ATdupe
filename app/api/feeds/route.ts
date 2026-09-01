import { NextResponse } from "next/server";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TASK_FEEDS = [
  { name: "FileFlow", url: process.env.FILEFLOW_TASKS_FEED || "https://portal.edwardsfamilylaw.com/api/tasks-feed" },
  { name: "Client Portal", url: process.env.PORTAL_TASKS_FEED || "https://clients.edwardsfamilylaw.com/api/tasks-feed" },
];
const ACTIVITY_FEED = process.env.PORTAL_ACTIVITY_FEED || "https://clients.edwardsfamilylaw.com/api/activity-feed";

// Fetched here rather than in the browser so the feed key never leaves the
// server and there is no cross-origin problem to work around.
async function pull(url: string, key: string) {
  const r = await fetch(url, { headers: { "X-Feed-Key": key }, cache: "no-store" });
  if (r.status === 401 || r.status === 403) return { badKey: true };
  if (!r.ok) return { failed: true, status: r.status };
  return { data: await r.json() };
}

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The server key is the normal path; a header lets one person try a key
  // without it being saved for everybody.
  const key = req.headers.get("x-feed-key") || process.env.FEED_KEY || "";
  if (!key) return NextResponse.json({ needKey: true, tasks: [], activity: [] });

  const [taskResults, act] = await Promise.all([
    Promise.all(TASK_FEEDS.map(async (f) => {
      try { return { name: f.name, ...(await pull(f.url, key)) }; }
      catch (e: any) { return { name: f.name, failed: true, why: String(e.message).slice(0, 120) }; }
    })),
    (async () => { try { return await pull(ACTIVITY_FEED, key); } catch { return { failed: true }; } })(),
  ]);

  let tasks: any[] = [];
  const sources: { name: string; count: number | null; problem?: string }[] = [];
  let anyBadKey = false, anyReachable = false;

  for (const r of taskResults as any[]) {
    if (r.data) {
      const list = r.data.tasks || [];
      tasks = tasks.concat(list);
      sources.push({ name: r.name, count: list.length });
      anyReachable = true;
    } else if (r.badKey) {
      anyBadKey = true; anyReachable = true;
      sources.push({ name: r.name, count: null, problem: "key rejected" });
    } else {
      sources.push({ name: r.name, count: null, problem: "unreachable" });
    }
  }
  tasks.sort((a, b) => (String(a.since) < String(b.since) ? 1 : -1));

  const a: any = act;
  const activity = a?.data?.items ? [...a.data.items].sort((x: any, y: any) => (String(x.at) < String(y.at) ? 1 : -1)) : [];

  return NextResponse.json({
    tasks, sources, activity,
    activityUrl: a?.data?.activityUrl || null,
    activityOk: !!a?.data,
    badKey: anyBadKey && anyReachable && sources.every((s) => s.count === null),
    generatedAt: new Date().toISOString(),
  });
}
