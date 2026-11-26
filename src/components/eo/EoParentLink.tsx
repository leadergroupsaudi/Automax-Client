import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CornerLeftUp, Loader2 } from "lucide-react";
import { useEoRecord, useEoRecordTypes } from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { eoRecordSubject } from "../../lib/eoFields";

interface EoParentLinkProps {
  /** The parent's id, straight off the child's `parent_record_id`. */
  parentId: string;
}

/**
 * The record this one hangs under, shown on the child's own detail page.
 *
 * WHY IT NEEDS ITS OWN COMPONENT. `parent_record_id` is an engine-owned key
 * (EO_ENGINE_OWNED_KEYS), so it is filtered out of the field grid along with
 * `state_id` and `created_by_id` — correct for a form, which must never submit
 * it, but it meant the hierarchy was invisible from the child's side: the
 * children tab showed a parent its children, and nothing showed a child its
 * parent. A bare uuid would not have helped either; this resolves the parent's
 * reference and subject so the link reads like the record it points at.
 *
 * A FAILED READ IS NOT "NO PARENT". §7.11 lets a child be visible to someone
 * who cannot read its parent, so a 403/404 here is an ordinary outcome, not a
 * fault: the row still says the record has a parent and declines to name it,
 * rather than vanishing and implying the record stands alone.
 */
export const EoParentLink: React.FC<EoParentLinkProps> = ({ parentId }) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();
  // retry:false — an unreadable parent is an expected answer here, and
  // retrying a 403 three times only delays the row.
  const parentQuery = useEoRecord(parentId, { retry: false });
  const typesQuery = useEoRecordTypes();
  const parent = parentQuery.data?.data;

  const parentTypeKey = useMemo(
    () =>
      (typesQuery.data?.data ?? []).find(
        (rt) => rt.id === parent?.record_type_id,
      )?.key,
    [typesQuery.data, parent],
  );

  const label = t("eo.detail.parent.label", "Parent record");

  let body: React.ReactNode;
  if (parentQuery.isLoading) {
    body = (
      <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        {t("common.loading", "Loading…")}
      </span>
    );
  } else if (!parent) {
    body = (
      <span className="text-slate-500 dark:text-slate-400">
        {t(
          "eo.detail.parent.unreadable",
          "This record has a parent you are not allowed to open.",
        )}
      </span>
    );
  } else {
    const subject = eoRecordSubject(parent, localize);
    const inner = (
      <>
        <span className="font-medium">{parent.reference}</span>
        {subject && (
          <span className="text-slate-500 dark:text-slate-400">
            {" "}
            — {subject}
          </span>
        )}
      </>
    );
    body = parentTypeKey ? (
      <Link
        to={`/eo/${parentTypeKey}/${parent.id}`}
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        {inner}
      </Link>
    ) : (
      // The catalogue has not resolved the parent's type, so there is no
      // route to send them to. The reference still identifies it.
      <span className="text-slate-700 dark:text-slate-200">{inner}</span>
    );
  }

  return (
    <div className="md:col-span-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        <span className="inline-flex items-center gap-1.5">
          <CornerLeftUp
            className="w-3.5 h-3.5 rtl:-scale-x-100"
            aria-hidden="true"
          />
          {label}
        </span>
      </dt>
      <dd className="text-sm">{body}</dd>
    </div>
  );
};

export default EoParentLink;
