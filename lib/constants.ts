export const FIRMS = ["EFL", "Firm", "Bullard", "C Stadler", "Gillian", "J Edwards", "Kelly Schiffer", "AHLF"];
export const KINDS = ["RIE Email", "Uploaded Doc", "Completed Task", "Create Task for KW", "Reviewed Docs", "Portal Chat"];
export const QUICK_HOURS = [0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.5, 2, 3];
export const TASK_USERS = ["RIE", "KW", "KV"];

export const KIND_CLASS: Record<string, string> = {
  "RIE Email": "t1", "Uploaded Doc": "t2", "Completed Task": "t3",
  "Create Task for KW": "t4", "Reviewed Docs": "t5", "Portal Chat": "t6",
};

// Priority prefix drives the row colour on the Tasks page.
export function prioClass(p?: string | null): string {
  const s = (p || "").toLowerCase();
  if (s.startsWith("00")) return "p0";
  if (s.startsWith("01")) return "p1";
  if (s.startsWith("02")) return "p2";
  if (s.startsWith("03")) return "p3";
  if (s.indexOf("hold") >= 0) return "ph";
  if (s.indexOf("waiting") >= 0) return "pw";
  return "";
}
