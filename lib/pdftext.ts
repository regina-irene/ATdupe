// Rebuilds a PDF's text with its columns intact. Plain extraction returns the
// pieces in reading order with labels and amounts separated, which makes a
// billing summary impossible to read back reliably. Grouping the text items by
// their y position and ordering by x reproduces the printed rows.
export async function extractLayoutText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf: any = await getDocumentProxy(bytes);
  const pages: string[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();

    for (const item of content.items as any[]) {
      const s = typeof item.str === "string" ? item.str : "";
      if (!s.trim()) continue;
      const tr = item.transform || [];
      const x = Number(tr[4]) || 0;
      const y = Number(tr[5]) || 0;
      // Round the baseline so pieces printed on the same line land together.
      const key = Math.round(y / 2) * 2;
      const bucket = rows.get(key);
      if (bucket) bucket.push({ x, s });
      else rows.set(key, [{ x, s }]);
    }

    const ys = [...rows.keys()].sort((a, b) => b - a); // top of the page first
    const lines = ys.map((y) => {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x);
      let line = "";
      let prevEnd = 0;
      for (const p of parts) {
        // Approximate the printed gap so columns stay apart.
        const gap = prevEnd ? Math.max(1, Math.round((p.x - prevEnd) / 5)) : 0;
        line += (line ? " ".repeat(Math.min(gap, 12)) : "") + p.s;
        prevEnd = p.x + p.s.length * 5;
      }
      return line;
    });
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}
