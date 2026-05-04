import { useCallback, useEffect, useRef, useState } from "react";
import type { GoalFilter } from "../types/goal";

const STORAGE_KEY = "goals.savedViews";
const MAX_VIEWS = 20;

export interface SavedView {
  id: string;
  name: string;
  filters: GoalFilter;
  createdAt: string;
}

/**
 * Strip transient/route-derived fields before persisting:
 * - `page` resets per visit
 * - `limit` is a session/UI concern (re-applied from current session on apply)
 * - `scope` is owned by the URL (`/goals/mine`), not by the saved view
 *
 * NOTE: This is also why default seeded views deliberately omit a "My drafts"
 * preset — it would need `scope: 'mine'`, which violates this rule.
 */
function sanitizeFilters(filters: GoalFilter): GoalFilter {
  const { page: _page, limit: _limit, scope: _scope, ...rest } = filters;
  return rest;
}

function readFromStorage(): SavedView[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        v &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        typeof v.createdAt === "string" &&
        v.filters &&
        typeof v.filters === "object",
    );
  } catch {
    return [];
  }
}

function writeToStorage(views: SavedView[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* localStorage may be unavailable / quota-exceeded — silently ignore */
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface SeedDefaultsArgs {
  activeHighPriorityName: string;
  draftsName: string;
}

interface UseSavedViewsReturn {
  views: SavedView[];
  saveView: (name: string, filters: GoalFilter) => SavedView | null;
  deleteView: (id: string) => void;
  /**
   * Seed two starter views — only on first mount, only if localStorage was
   * missing the key entirely. No-op on subsequent calls or when any prior
   * data exists. Names are passed in by the caller so they can be localized.
   */
  seedDefaults: (args: SeedDefaultsArgs) => void;
}

/**
 * Saved Views storage hook. Reads from localStorage on mount, write-through on
 * every mutation. No backend dependency.
 */
export function useSavedViews(): UseSavedViewsReturn {
  // Detect first-mount-with-no-key so that callers can seed defaults exactly
  // once. We still default `views` to `[]` if the key is missing.
  const initiallyMissingRef = useRef<boolean>(false);
  const [views, setViews] = useState<SavedView[]>(() => {
    const stored = readFromStorage();
    if (stored === null) {
      initiallyMissingRef.current = true;
      return [];
    }
    return stored;
  });

  // Skip the very first effect run so we don't write back the freshly-read
  // value (or wipe the key when nothing has changed yet).
  const skipNextWriteRef = useRef<boolean>(true);
  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    writeToStorage(views);
  }, [views]);

  const saveView = useCallback(
    (name: string, filters: GoalFilter): SavedView | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const view: SavedView = {
        id: generateId(),
        name: trimmed,
        filters: sanitizeFilters(filters),
        createdAt: new Date().toISOString(),
      };
      let created: SavedView | null = view;
      setViews((prev) => {
        const next = [...prev, view];
        if (next.length > MAX_VIEWS) {
          // Drop the oldest entries to stay under the cap.
          const trimmedList = next.slice(next.length - MAX_VIEWS);
          if (!trimmedList.some((v) => v.id === view.id)) {
            // The brand-new view fell off the front: surface that we didn't
            // actually persist it (caller can decide to toast).
            created = null;
          }
          return trimmedList;
        }
        return next;
      });
      return created;
    },
    [],
  );

  const deleteView = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const seedDefaults = useCallback(
    ({ activeHighPriorityName, draftsName }: SeedDefaultsArgs) => {
      if (!initiallyMissingRef.current) return;
      initiallyMissingRef.current = false;
      const now = new Date().toISOString();
      const defaults: SavedView[] = [
        {
          id: generateId(),
          name: activeHighPriorityName,
          // Note: the spec mentions a `My drafts` preset that would carry
          // `scope: 'mine'`, but saved views deliberately drop scope (it's
          // URL-derived). We seed plain `Draft` instead — clicking it shows
          // every user's drafts; pair it with the My Goals route for "mine".
          filters: { status: "Active", priority: "High" },
          createdAt: now,
        },
        {
          id: generateId(),
          name: draftsName,
          filters: { status: "Draft" },
          createdAt: now,
        },
      ];
      setViews(defaults);
    },
    [],
  );

  return { views, saveView, deleteView, seedDefaults };
}

/** Exposed for tests / consumers that need the same sanitization. */
export { sanitizeFilters };
