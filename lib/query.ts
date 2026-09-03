export const SORTS: Record<string, string> = {
  date: "entry_date", case: "lower(case_name)", entry: "lower(time_entry)",
  hrs: "duration", who: "lower(user_name)", type: "kind",
  firm: "firm", billed: "billed", url: "url", content: "lower(content)",
  email: "lower(user_email)", added: "created_at", changed: "updated_at",
};

export function orderBy(sp: URLSearchParams): string {
  const col = SORTS[sp.get("sort") || "date"] || SORTS.date;
  const dir = (sp.get("dir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  return `order by ${col} ${dir} nulls last, id desc`;
}

// Free-text search across a whole row. Every whitespace-separated word has to
// appear somewhere in the listed columns, so "smith depo" finds the Smith
// deposition entry however the words are ordered.
export function searchClause(term: string, cols: string[], from: number): { sql: string; params: any[] } {
  const words = term.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return { sql: "", params: [] };
  const blob = "concat_ws(' ', " + cols.join(", ") + ")";
  const params: any[] = [];
  const parts = words.map((w, i) => { params.push("%" + w + "%"); return blob + " ilike $" + (from + i); });
  return { sql: "(" + parts.join(" and ") + ")", params };
}

export function buildWhere(sp: URLSearchParams) {
  const where: string[] = [];
  const params: any[] = [];
  const add = (clause: string, value: any) => {
    params.push(value);
    where.push(clause.replace("?", "$" + params.length));
  };
  // Several values for one field: user=RIE&user=KW means either.
  const anyOf = (name: string, col: string) => {
    const vals = sp.getAll(name).filter(Boolean);
    if (vals.length) add(`${col} = any(?::text[])`, vals);
  };

  if (sp.get("from")) add("entry_date >= ?::date", sp.get("from"));
  if (sp.get("to")) add("entry_date <= ?::date", sp.get("to"));

  // Rolling windows, so a saved view still means "this week" next week.
  const days = parseInt(sp.get("lastDays") || "", 10);
  if (isFinite(days) && days > 0) add("entry_date >= current_date - ?::int", days);
  const within = sp.get("within");
  if (within === "week") where.push("entry_date >= date_trunc('week', current_date)");
  if (within === "month") where.push("entry_date >= date_trunc('month', current_date)");
  if (within === "year") where.push("entry_date >= date_trunc('year', current_date)");
  if (within === "today") where.push("entry_date = current_date");
  if (within === "yesterday") where.push("entry_date = current_date - 1");

  anyOf("user", "user_name");
  anyOf("kind", "kind");
  anyOf("firm", "firm");

  if (sp.get("case")) add("case_name ilike ?", "%" + sp.get("case") + "%");
  if (sp.get("notCase")) add("coalesce(case_name,'') not ilike ?", "%" + sp.get("notCase") + "%");
  if (sp.get("caseEmpty") === "1") where.push("(case_name is null or case_name = '')");

  if (sp.get("minHrs")) add("duration >= ?::numeric", sp.get("minHrs"));
  if (sp.get("maxHrs")) add("duration <= ?::numeric", sp.get("maxHrs"));
  if (sp.get("noHrs") === "1") where.push("(duration is null or duration = 0)");

  if (sp.get("hasUrl") === "1") where.push("(url is not null and url <> '')");
  if (sp.get("hasUrl") === "0") where.push("(url is null or url = '')");

  const src = sp.getAll("source").filter(Boolean);
  if (src.length) add("source = any(?::text[])", src);

  const qStr = sp.get("q");
  if (qStr) {
    params.push("%" + qStr + "%");
    const a = params.length;
    params.push("%" + qStr + "%");
    where.push("(time_entry ilike $" + a + " or content ilike $" + params.length + ")");
  }
  // The one search box above the table looks at every column a person can see.
  const term = sp.get("search");
  if (term && term.trim()) {
    const cols = ["time_entry", "content", "case_name", "user_name", "user_email", "kind", "firm", "url", "entry_date::text"];
    const c = searchClause(term, cols, params.length + 1);
    if (c.sql) { params.push(...c.params); where.push(c.sql); }
  }

  const notQ = sp.get("notQ");
  if (notQ) add("coalesce(time_entry,'') not ilike ?", "%" + notQ + "%");

  if (sp.get("billed") === "true") where.push("billed = true");
  if (sp.get("billed") === "false") where.push("billed = false");
  if (sp.get("trash") !== "1") where.push("marked_for_deletion = false");

  return { sql: where.length ? "where " + where.join(" and ") : "", params };
}
