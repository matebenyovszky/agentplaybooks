/** Render pipe tables after inline markup/code has been protected by the caller. */
export function renderMarkdownTables(text: string): string {
  return text.replace(/^\|[^\n]*\|\r?\n\|[ \t:|\-]+\|(?:\r?\n\|[^\n]*\|)*/gm, block => {
    const rows = block.split(/\r?\n/).map(line => line.trim().slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|")));
    const [header, separator, ...body] = rows;
    if (header.length !== separator.length || !separator.every(cell => /^:?-{3,}:?$/.test(cell))) return block;
    const head = header.map(cell => `<th scope="col" class="px-4 py-3 text-left font-semibold">${cell}</th>`).join("");
    const renderedBody = body.map(row => `<tr>${header.map((_, index) => `<td class="px-4 py-3">${row[index] ?? ""}</td>`).join("")}</tr>`).join("");
    return `<div class="overflow-x-auto mb-6"><table class="w-full border-collapse"><thead><tr>${head}</tr></thead><tbody>${renderedBody}</tbody></table></div>`;
  });
}
