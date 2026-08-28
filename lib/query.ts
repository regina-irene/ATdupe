export const SORTS: Record<string, string> = {
  date: "entry_date", case: "lower(case_name)", entry: "lower(time_entry)",
  hrs: "duration", who: "lower(user_name)", type: "kind",
};

export function orderBy(sp: URLSearchParams): string {
  const col = SORTS[sp.get("sort") || "date"] || SORTS.date;
  const dir = (sp.get("dir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  return `order by ${col} ${dir} nulls last, id desc`;
}

export function buildWhere(sp: URLSearchParams) {
  const where: string[] = [];
  const params: any[] = [];
  const add = (clause: string, value: any) => { params.push(value); where.push(clause.replace("?", "$" + params.length)); };

  if (sp.get("from")) add("entry_date >= ?::date", sp.get("from"));
  if (sp.get("to")) add("entry_date <= ?::date", sp.get("to"));
  if (sp.get("user")) add("user_name = ?", sp.get("user"));
  if (sp.get("case")) add("case_name ilike ?", "%" + sp.get("case") + "%");
  if (sp.get("kind")) add("kind = ?", sp.get("kind"));
  if (sp.get("firm")) add("firm = ?", sp.get("firm"));

  const qStr = sp.get("q");
  if (qStr) {
    params.push("%" + qStr + "%");
    const a = params.length;
    params.push("%" + qStr + "%");
    where.push("(time_entry ilike $" + a + " or content ilike $" + params.length + ")");
  }
  if (sp.get("billed") === "true") where.push("billed = true");
  if (sp.get("billed") === "false") where.push("billed = false");
  if (sp.get("trash") !== "1") where.push("marked_for_deletion = false");

  return { sql: where.length ? "where " + where.join(" and ") : "", params };
}
