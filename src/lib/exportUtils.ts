type CellValue = string | number | boolean | null | undefined;

/** Download a CSV file. Adds BOM so Excel opens UTF-8 correctly. */
export function downloadCSV(
  headers: string[],
  rows: CellValue[][],
  filename: string,
) {
  const escape = (v: CellValue) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;

  const csv =
    "\uFEFF" + // BOM for Excel
    [headers, ...rows]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `${filename}-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Open a new tab with print-ready HTML and trigger the print dialog. */
export function printTable(
  title: string,
  headers: string[],
  rows: CellValue[][],
  subtitle?: string,
) {
  const rows_html = rows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${c ?? "—"}</td>`).join("")}</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  p.sub{font-size:11px;color:#666;margin:0 0 14px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}
  th{background:#f5f5f5;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  tr:nth-child(even){background:#fafafa}
  @media print{body{margin:0}button{display:none}}
</style>
</head>
<body>
<h1>${title}</h1>
${subtitle ? `<p class="sub">${subtitle}</p>` : ""}
<p class="sub">Gjeneruar: ${new Date().toLocaleString("sq-AL")}</p>
<table>
  <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows_html}</tbody>
</table>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}
