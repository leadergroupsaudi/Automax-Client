import React, { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowLeft, Database, Link2, Sliders } from "lucide-react";
import {
  useEoType,
  useEoTypeList,
  useEoTypeRecordCounts,
} from "../../hooks/useEoTypes";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { eoRefusalMessage } from "../../lib/eoFields";
import type { EoRecordType } from "../../types/eoRecord";

type DesignerTab = "attributes" | "fields" | "links";

const TABS: {
  id: DesignerTab;
  labelKey: string;
  fallback: string;
  icon: React.ElementType;
}[] = [
  {
    id: "attributes",
    labelKey: "eo.types.tabs.attributes",
    fallback: "Attributes",
    icon: Sliders,
  },
  {
    id: "fields",
    labelKey: "eo.types.tabs.fields",
    fallback: "Fields",
    icon: Database,
  },
  {
    id: "links",
    labelKey: "eo.types.tabs.links",
    fallback: "Links",
    icon: Link2,
  },
];

const isTab = (v: string | null): v is DesignerTab =>
  v === "attributes" || v === "fields" || v === "links";

/**
 * The record-type designer's shell: one type, three tabs.
 *
 * Task F1 builds the shell and the facts every tab needs — the type, its own
 * field definitions (which the by-id read carries and the list read does
 * not), and whether it holds records. F2 fills Attributes, F3 Fields, F4
 * Links, and F5 adds the destructive-edit confirmation that the record count
 * below is the trigger for.
 *
 * The tab lives in the query string so a tab is linkable and survives a
 * reload, which the field editor in particular will want.
 */
export const EoTypeDesignerPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const localize = useLocalizedField();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: DesignerTab = isTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as DesignerTab)
    : "attributes";

  const typeQuery = useEoType(id);
  const recordType = typeQuery.data?.data;

  // The catalogue, for the subtree the record count is taken over and for the
  // parent's name in the header.
  const listQuery = useEoTypeList();
  const allTypes = useMemo<EoRecordType[]>(
    () => listQuery.data?.data ?? [],
    [listQuery.data],
  );
  const { recordCount, isNarrowed, isUnreadable } =
    useEoTypeRecordCounts(allTypes);
  const records = recordCount(id);

  const parent = useMemo(
    () =>
      recordType?.parent_type_id
        ? allTypes.find((x) => x.id === recordType.parent_type_id)
        : undefined,
    [allTypes, recordType],
  );

  if (typeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (typeQuery.error || !recordType) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-800 dark:text-red-300">
              {eoRefusalMessage(
                typeQuery.error,
                t("eo.types.notFound", "That record type does not exist."),
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const typeName =
    localize(recordType as unknown as Record<string, unknown>, "name") ||
    recordType.name;
  const ownFields = recordType.fields ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/admin/eo-record-types"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl:-rotate-180" />
          {t("eo.types.title", "EO record types")}
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {typeName}
            </h1>
            <span className="px-2 py-0.5 rounded-md text-xs font-mono bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30">
              {recordType.key}
            </span>
            {recordType.is_abstract && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                {t("eo.types.abstract", "Abstract")}
              </span>
            )}
            {!recordType.is_active && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30">
                {t("eo.types.inactive", "Inactive")}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {parent
              ? t("eo.types.inheritsFrom", {
                  parent:
                    localize(
                      parent as unknown as Record<string, unknown>,
                      "name",
                    ) || parent.name,
                  defaultValue: `Inherits from ${
                    localize(
                      parent as unknown as Record<string, unknown>,
                      "name",
                    ) || parent.name
                  }`,
                })
              : t("eo.types.noParent2", "Inherits from nothing")}
            {recordType.reference_pattern
              ? ` · ${recordType.reference_pattern}`
              : ""}
            {` · ${t("eo.types.ownFieldCount", {
              count: ownFields.length,
              defaultValue: `${ownFields.length} own fields`,
            })}`}
          </p>
        </div>
      </div>

      {/* Whether the type holds records, which is what §7.14 keys every
          guard rail off. Shown here because it changes what F2 and F5 may
          offer, and because an administrator should know before they edit. */}
      {records !== undefined && records > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t("eo.types.holdsRecords", {
              count: records,
              defaultValue: `This record type and the types beneath it hold ${records} records. Removing a field, changing its kind, making it required, re-keying, re-parenting or changing the reference will be refused unless it is confirmed.`,
            })}
          </p>
        </div>
      )}
      {/* NOT gated on `records > 0`. A restricted designer is exactly the
          caller whose count reads 0 while the server holds records, so
          hiding this behind a non-zero count would withhold it from the only
          person who needs it — and the destructive-edit flow (F5) would then
          be entered with no warning on the screen at all. */}
      {isNarrowed && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t(
              "eo.types.countsNarrowed",
              "Record counts are taken from your own view of the registers and may be lower than what the server holds. The server, not this count, decides whether an edit is refused.",
            )}
          </p>
        </div>
      )}
      {isUnreadable && (
        <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-800 dark:text-red-300">
            {t(
              "eo.types.countsUnreadable",
              "Some record counts could not be read and are shown as —. Treat a missing count as unknown, not as zero.",
            )}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700/60">
        <nav className="-mb-px flex gap-6">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSearchParams({ tab: item.id })}
                className={`inline-flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(item.labelKey, item.fallback)}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Panels. F2–F4 replace each placeholder with the editor for that tab;
          the shell owns the type, the record count and the tab state they
          read. */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-6">
        {tab === "attributes" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(
              "eo.types.tabs.attributesPending",
              "The attribute editor is not built yet.",
            )}
          </p>
        )}
        {tab === "fields" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("eo.types.tabs.fieldsPending", {
              count: ownFields.length,
              defaultValue: `This type declares ${ownFields.length} fields of its own. The field editor is not built yet.`,
            })}
          </p>
        )}
        {tab === "links" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(
              "eo.types.tabs.linksPending",
              "The link-type editor is not built yet.",
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default EoTypeDesignerPage;
