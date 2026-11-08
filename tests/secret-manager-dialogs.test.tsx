// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretManager } from "@/components/playbook/SecretManager";
import type { StorageAdapter } from "@/lib/storage";
import type { SecretMetadata } from "@/lib/supabase/types";

// Keep real React events/state, but skip exit animations and animation timers.
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ initial, animate, exit, ...props }: ComponentProps<"div"> & {
      initial?: unknown; animate?: unknown; exit?: unknown;
    }) => {
      void initial; void animate; void exit;
      return createElement("div", props);
    },
  },
}));

const secret: SecretMetadata = {
  id: "secret-1", playbook_id: "playbook-1", name: "EXISTING_KEY",
  category: "api_key", description: null, rotated_at: null, expires_at: null,
  last_used_at: null, use_count: 0, allow_api_key_reveal: false,
  allowed_hosts: [], created_at: "2026-11-06T10:00:00Z", updated_at: "2026-11-06T10:00:00Z",
};

let container: HTMLDivElement;
let root: Root;
let addSecret: ReturnType<typeof vi.fn>;
let updateSecret: ReturnType<typeof vi.fn>;
let confirmDiscard: ReturnType<typeof vi.fn>;

function button(text: string, scope: ParentNode = container): HTMLButtonElement {
  const result = [...scope.querySelectorAll("button")].find(el => el.textContent?.trim() === text);
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}

const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]')!;
const input = (selector: string) => dialog().querySelector<HTMLInputElement>(selector)!;
const click = async (el: HTMLElement) => { await act(async () => el.click()); };

async function fill(el: HTMLInputElement | HTMLSelectElement, value: string) {
  // Use the native setter so React detects the same change as browser input.
  const prototype = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
  await act(async () => el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })));
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  confirmDiscard = vi.fn(() => false);
  vi.stubGlobal("confirm", confirmDiscard);
  addSecret = vi.fn(async () => ({ ...secret, name: "NEW_KEY" }));
  updateSecret = vi.fn(async () => secret);
  const storage = { getSecrets: async () => [secret], addSecret, updateSecret } as unknown as StorageAdapter;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<SecretManager storage={storage} secrets={[secret]} onUpdate={vi.fn()} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("secret editor dismissal", () => {
  it("keeps edits after backdrop clicks and a selection ending outside the dialog", async () => {
    await click(button("Add Secret"));
    const name = input('[placeholder="e.g. OPENAI_API_KEY"]');
    await fill(name, "NEW_KEY");
    await fill(input('[type="password"]'), "test-only-value");
    await click(dialog().parentElement!);
    expect(dialog(), "a backdrop click must keep the editor open").toBeTruthy();
    await act(async () => {
      name.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      dialog().parentElement!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      dialog().parentElement!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      name.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(dialog()).toBeTruthy();
    expect(name.value).toBe("NEW_KEY");
    expect(input('[type="password"]').value).toBe("test-only-value");
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(addSecret).not.toHaveBeenCalled();
  });

  it.each(["Cancel", "Close new secret"])("protects unsaved create edits when using %s", async (action) => {
    await click(button("Add Secret"));
    await fill(input('[placeholder="e.g. OPENAI_API_KEY"]'), "NEW_KEY");
    const close = () => action === "Cancel" ? button("Cancel", dialog())
      : dialog().querySelector<HTMLButtonElement>('[aria-label="Close new secret"]')!;
    await click(close());
    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(dialog()).toBeTruthy();
    expect(input('[placeholder="e.g. OPENAI_API_KEY"]').value).toBe("NEW_KEY");
    confirmDiscard.mockReturnValue(true);
    await click(close());
    expect(dialog()).toBeNull();
    await click(button("Add Secret"));
    expect(input('[placeholder="e.g. OPENAI_API_KEY"]').value).toBe("");
  });

  it("closes a pristine create dialog without confirmation, but protects category-only edits", async () => {
    await click(button("Add Secret"));
    await click(button("Cancel", dialog()));
    expect(dialog()).toBeNull();
    expect(confirmDiscard).not.toHaveBeenCalled();
    await click(button("Add Secret"));
    await fill(dialog().querySelector("select")!, "password");
    await click(button("Cancel", dialog()));
    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(dialog()).toBeTruthy();
  });

  it("blocks dismissal during creation and closes normally after a successful save", async () => {
    let resolveSave!: (result: SecretMetadata) => void;
    addSecret.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
    await click(button("Add Secret"));
    await fill(input('[placeholder="e.g. OPENAI_API_KEY"]'), "NEW_KEY");
    await fill(input('[type="password"]'), "test-only-value");
    await click(button("Store Secret", dialog()));
    expect(button("Cancel", dialog()).disabled).toBe(true);
    expect(dialog().querySelector<HTMLButtonElement>('[aria-label="Close new secret"]')!.disabled).toBe(true);
    await click(button("Cancel", dialog()));
    await click(dialog().parentElement!);
    expect(dialog()).toBeTruthy();
    await act(async () => resolveSave({ ...secret, name: "NEW_KEY" }));
    expect(dialog()).toBeNull();
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(addSecret).toHaveBeenCalledOnce();
  });

  it("keeps create edits when saving fails", async () => {
    addSecret.mockRejectedValue(new Error("Test save failed"));
    await click(button("Add Secret"));
    await fill(input('[placeholder="e.g. OPENAI_API_KEY"]'), "NEW_KEY");
    await fill(input('[type="password"]'), "test-only-value");
    await click(button("Store Secret", dialog()));
    expect(dialog().textContent).toContain("Test save failed");
    expect(input('[type="password"]').value).toBe("test-only-value");
    expect(button("Cancel", dialog()).disabled).toBe(false);
  });

  it("protects rotation value and expiry edits, including while saving", async () => {
    let resolveSave!: (result: SecretMetadata) => void;
    updateSecret.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
    await click(container.querySelector<HTMLButtonElement>('[title="Rotate secret"]')!);
    await fill(input('[type="datetime-local"]'), "2027-01-01T12:00");
    const close = dialog().querySelector<HTMLButtonElement>('[aria-label="Close secret rotation"]')!;
    await click(close);
    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(dialog()).toBeTruthy();
    await fill(input('[type="password"]'), "replacement-test-value");
    await click(dialog().parentElement!);
    expect(input('[type="password"]').value).toBe("replacement-test-value");
    await click(button("Rotate", dialog()));
    expect(close.disabled).toBe(true);
    expect(button("Cancel", dialog()).disabled).toBe(true);
    await click(dialog().parentElement!);
    expect(dialog()).toBeTruthy();
    await act(async () => resolveSave(secret));
    expect(dialog()).toBeNull();
    expect(updateSecret).toHaveBeenCalledOnce();
  });
});
