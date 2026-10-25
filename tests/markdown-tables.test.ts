import { expect, it } from "vitest";
import { renderMarkdownTables } from "../src/lib/markdown-tables";

it("renders one semantic table with headers and preserves empty columns", () => {
  const html = renderMarkdownTables("| Name | Empty | Value |\n| --- | :---: | ---: |\n| row | | tail |\n");
  expect(html.match(/<table /g)).toHaveLength(1);
  expect(html.match(/<th /g)).toHaveLength(3);
  expect(html.match(/<td /g)).toHaveLength(3);
  expect(html).toContain('class="min-w-20 wrap-normal px-4 py-3"></td>');
  expect(html).toContain('class="overflow-x-auto mb-6"');
  expect(html).toContain("w-max min-w-full border-collapse wrap-normal");
  expect(html).toContain("<thead>");
});
it("leaves prose and pipes without a valid table separator unchanged", () => {
  const prose = "ordinary | prose | stays\n\n| not | a table |\n| text | here |";
  expect(renderMarkdownTables(prose)).toBe(prose);
});
