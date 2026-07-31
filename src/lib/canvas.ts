export type CanvasPatchOperation =
  | { operation: "append"; content: string }
  | { operation: "prepend"; content: string }
  | { operation: "replace"; search: string; content: string };

export function slugifyCanvasName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function applyCanvasPatch(current: string, patch: CanvasPatchOperation): string {
  if (patch.operation === "append") {
    return current.length > 0 ? `${current}\n${patch.content}` : patch.content;
  }

  if (patch.operation === "prepend") {
    return current.length > 0 ? `${patch.content}\n${current}` : patch.content;
  }

  if (!patch.search) {
    throw new Error("Search text is required for replace operations");
  }

  const firstMatch = current.indexOf(patch.search);
  if (firstMatch === -1) {
    throw new Error("Search text was not found in the canvas document");
  }
  if (current.indexOf(patch.search, firstMatch + patch.search.length) !== -1) {
    throw new Error("Search text must identify exactly one passage");
  }

  return `${current.slice(0, firstMatch)}${patch.content}${current.slice(firstMatch + patch.search.length)}`;
}
