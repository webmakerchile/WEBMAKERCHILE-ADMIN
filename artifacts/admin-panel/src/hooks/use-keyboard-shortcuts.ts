import { useEffect, useRef } from "react";

export type ShortcutHandler = (event: KeyboardEvent) => void;

export type ShortcutDefinition = {
  // Plain single key, e.g. "n", "?". For sequences (g i, g v) use prefix+key.
  key: string;
  // Optional prefix to wait for (e.g. "g" to support "g i", "g v").
  prefix?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  // Allow firing even while an input is focused (rare; default: false).
  allowInInput?: boolean;
  description?: string;
  handler: ShortcutHandler;
};

const PREFIX_TIMEOUT_MS = 1200;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  // Radix dialogs / cmdk inputs use role=combobox/textbox
  const role = target.getAttribute("role");
  if (role === "textbox" || role === "combobox") return true;
  return false;
}

function matchesModifiers(e: KeyboardEvent, def: ShortcutDefinition): boolean {
  const meta = !!def.meta;
  const ctrl = !!def.ctrl;
  const shift = !!def.shift;
  // For Cmd/Ctrl combos accept either modifier — many users expect both.
  if (meta || ctrl) {
    if (!(e.metaKey || e.ctrlKey)) return false;
  } else {
    if (e.metaKey || e.ctrlKey) return false;
  }
  if (shift !== e.shiftKey) {
    // For "?" we need shift on most layouts; allow if key already matches "?".
    if (def.key !== "?") return false;
  }
  return true;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const prefixRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const list = shortcutsRef.current;
      if (!list || list.length === 0) return;
      const now = Date.now();
      const editing = isEditableTarget(event.target);
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      // Resolve any pending prefix: look for `prefix+key` matches first.
      const prefix = prefixRef.current;
      if (prefix && now - prefix.at <= PREFIX_TIMEOUT_MS) {
        const match = list.find(
          (s) =>
            s.prefix &&
            s.prefix.toLowerCase() === prefix.key &&
            s.key.toLowerCase() === key &&
            (s.allowInInput || !editing) &&
            matchesModifiers(event, s),
        );
        prefixRef.current = null;
        if (match) {
          event.preventDefault();
          match.handler(event);
          return;
        }
      } else {
        prefixRef.current = null;
      }

      // Try direct (non-prefix) shortcuts.
      const match = list.find(
        (s) =>
          !s.prefix &&
          s.key.toLowerCase() === key &&
          (s.allowInInput || !editing) &&
          matchesModifiers(event, s),
      );
      if (match) {
        event.preventDefault();
        match.handler(event);
        return;
      }

      // Otherwise, if this key is a registered prefix, capture it for the next stroke.
      if (!editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const isPrefix = list.some((s) => s.prefix?.toLowerCase() === key);
        if (isPrefix) {
          prefixRef.current = { key, at: now };
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
