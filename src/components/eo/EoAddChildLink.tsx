import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Link2, Loader2, Plus } from "lucide-react";
import { useEoRecordTypes } from "../../hooks/useEoRecords";
import { useEoLinkTypes } from "../../hooks/useEoTypes";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { usePermissions } from "../../hooks/usePermissions";
import { eoChildLinkOptions } from "../../lib/eoLinks";
import type { EoRecordType } from "../../types/eoRecord";

interface EoAddChildLinkProps {
  /** The record the new child will hang off. */
  recordId: string;
  /** That record's type id — what the link types are matched against. */
  recordTypeId: string;
}

/**
 * "Add child record": the one way a user can put a record UNDER another one.
 *
 * WHY THIS IS A CREATE AND NOT A LINK. The server has two ways to relate two
 * records and they are not interchangeable. `parent_record_id` +
 * `parent_link_type_key` on the create is what makes a record a CHILD — it is
 * what `Children`, `BlockingChildren` and ancestor derivation all read.
 * `POST /eo-records/:id/links` writes a relationship only; its own handler
 * says so ("A link added here is a relationship, not a re-parenting"), and
 * because the blocking rule starts from the children list, a record attached
 * that way never holds its parent open. A Task linked to a Directive after the
 * fact would leave that Directive free to close with the Task still running,
 * which is the opposite of what `eo_task_parent` declares. So this control
 * only ever starts a create carrying the parent, and the ambiguous one is not
 * offered at all.
 *
 * It renders nothing when the record can take no child the user may create:
 * an empty menu is a dead end that reads like a broken button.
 */
export const EoAddChildLink: React.FC<EoAddChildLinkProps> = ({
  recordId,
  recordTypeId,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const localize = useLocalizedField();
  const { canEoRecordType } = usePermissions();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  /**
   * The menu is rendered in a PORTAL, positioned from the button's rect.
   *
   * The tab card this control sits in is `overflow-hidden` (it clips the tab
   * strip's rounded corners), and an absolutely positioned menu inside it is
   * clipped by that ancestor: with three child types on a Directive the last
   * one was cut off entirely and the second was sliced mid-sentence. Nothing
   * about the menu's own markup can escape an ancestor's overflow, so it is
   * taken out of that subtree and placed against the viewport instead.
   */
  const [rect, setRect] = useState<DOMRect | null>(null);
  /**
   * The portalled menu is NOT inside `boxRef`, so "did the click land outside
   * the control?" has to ask about both elements. Asking only about the
   * trigger's wrapper closed the menu on `mousedown` before the item's
   * `click` could fire — the menu opened, and choosing from it did nothing.
   */
  const menuRef = useRef<HTMLDivElement>(null);
  const place = useCallback(() => {
    const el = btnRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  const linkTypesQuery = useEoLinkTypes();
  const typesQuery = useEoRecordTypes();

  const typesById = useMemo(() => {
    const m = new Map<string, EoRecordType>();
    for (const rt of typesQuery.data?.data ?? []) m.set(rt.id, rt);
    return m;
  }, [typesQuery.data]);

  /**
   * The offer list, narrowed three times: to the link types this record's type
   * may parent, to child types that actually exist and hold records (an
   * abstract type cannot be instantiated), and to the types this user holds a
   * create code on. The last one matters because the route is gated on
   * `eo:view` alone — offering a type the caller cannot create just moves the
   * 403 to the end of a filled-in form.
   */
  const options = useMemo(() => {
    return eoChildLinkOptions(linkTypesQuery.data?.data, recordTypeId)
      .map((o) => ({ ...o, childType: typesById.get(o.childTypeId) }))
      .filter(
        (o) =>
          o.childType &&
          !o.childType.is_abstract &&
          canEoRecordType(o.childType.key, "create"),
      );
  }, [linkTypesQuery.data, recordTypeId, typesById, canEoRecordType]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = boxRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // The menu is fixed to the viewport, so it must follow the button when
    // the page moves under it rather than drifting away from its trigger.
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  if (linkTypesQuery.isLoading || typesQuery.isLoading) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t("eo.detail.addChild.loading", "Loading link types…")}
      </span>
    );
  }

  if (options.length === 0) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        ref={btnRef}
        onClick={() => {
          place();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        {t("eo.detail.addChild.button", "Add child record")}
        <ChevronDown className="w-4 h-4 opacity-60" aria-hidden="true" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            role="menu"
            ref={menuRef}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              // Aligned to the button's trailing edge in both directions: the
              // menu is wider than the button, so anchoring the wrong edge in
              // RTL would push it off-screen.
              ...(document.documentElement.dir === "rtl"
                ? { left: rect.left }
                : { right: window.innerWidth - rect.right }),
              maxHeight: `calc(100vh - ${rect.bottom + 16}px)`,
              // Without a cap a fixed-position box shrink-wraps to its widest
              // unwrapped line — the "blocks closure" sentence — and the menu
              // stretched most of the page width.
              maxWidth: "min(22rem, calc(100vw - 2rem))",
            }}
            className="z-50 min-w-[18rem] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
          >
            {options.map(({ linkType, childType }) => {
              const name =
                localize(
                  childType as unknown as Record<string, unknown>,
                  "name",
                ) || childType!.name;
              return (
                <button
                  key={linkType.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    navigate(
                      `/eo/${childType!.key}/new?parent=${encodeURIComponent(
                        recordId,
                      )}&link=${encodeURIComponent(linkType.key)}`,
                    );
                  }}
                  className="w-full text-start px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                    <Link2
                      className="w-3.5 h-3.5 opacity-60 flex-shrink-0"
                      aria-hidden="true"
                    />
                    {name}
                  </span>
                  {/*
                  The consequence, said once, where the choice is made. A child
                  under a blocking link type holds this record open until it is
                  closed, and that is not recoverable from the child's own form
                  later.
                */}
                  {linkType.blocks_parent_closure && (
                    <span className="block mt-0.5 ps-5 text-xs text-amber-700 dark:text-amber-400">
                      {t(
                        "eo.detail.addChild.blocks",
                        "Blocks this record from closing until it is closed",
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default EoAddChildLink;
