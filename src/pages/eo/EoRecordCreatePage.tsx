import React, { useMemo } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertCircle, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  useEoRecordTypes,
  useCreateEoRecord,
  useEoRecord,
} from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { usePermissions } from "../../hooks/usePermissions";
import { EoRecordForm } from "../../components/eo/EoRecordForm";
import type { EoValues } from "../../types/eoRecord";

export const EoRecordCreatePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { typeKey } = useParams<{ typeKey: string }>();
  const localize = useLocalizedField();
  const { canEoRecordType } = usePermissions();

  const typesQuery = useEoRecordTypes();
  const recordType = useMemo(
    () =>
      (typesQuery.data?.data ?? []).find(
        (rt) => rt.key === typeKey && !rt.is_abstract,
      ),
    [typesQuery.data, typeKey],
  );

  const createRecord = useCreateEoRecord();

  /**
   * The parent this record is being created UNDER, carried in the query string
   * by EoAddChildLink.
   *
   * BOTH OR NEITHER. The server refuses a `parent_record_id` that arrives with
   * no `parent_link_type_key` — the link type is what carries the child rules
   * (derived deadline, sensitivity cascade), so it will not infer one. A
   * half-filled link in the URL is therefore treated as no link at all rather
   * than sent to be rejected after the form has been filled in.
   */
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get("parent") ?? "";
  const parentLinkKey = searchParams.get("link") ?? "";
  const hasParent = !!parentId && !!parentLinkKey;

  // Named, not just referenced: a bare uuid in the URL tells the user nothing
  // about which record they are filing under. A failed read is not fatal here
  // — the create still carries the id — so the banner falls back to the id.
  const parentQuery = useEoRecord(hasParent ? parentId : "");
  const parentRecord = parentQuery.data?.data;

  // A record carries only its type ID, so the route back to it is resolved
  // through the catalogue the page has already loaded.
  const parentTypeKey = useMemo(
    () =>
      (typesQuery.data?.data ?? []).find(
        (rt) => rt.id === parentRecord?.record_type_id,
      )?.key,
    [typesQuery.data, parentRecord],
  );

  const handleSubmit = async (values: EoValues) => {
    if (!recordType) return;
    const res = await createRecord.mutateAsync({
      record_type_id: recordType.id,
      ...(hasParent
        ? {
            parent_record_id: parentId,
            parent_link_type_key: parentLinkKey,
          }
        : {}),
      values,
    });
    toast.success(t("eo.create.success", "Record created"));
    const created = res?.data;
    navigate(
      created ? `/eo/${recordType.key}/${created.id}` : `/eo/${recordType.key}`,
    );
  };

  if (typesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!recordType) {
    return (
      <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-300">
            {t("eo.create.unknownType", "That record type does not exist.")}
          </p>
        </div>
      </div>
    );
  }

  /**
   * The PAGE-LEVEL per-type guard. The route is gated on `eo:view` alone
   * (PermissionRoute in App.tsx), which every EO user holds, so without this
   * the page rendered a full create form for a type the caller holds no
   * `eo:<key>:create` code on — and the server answered 403 only after it
   * had been filled in. It is reached after the catalogue has settled and
   * `recordType` is a fact, so `canEoRecordType` is answering about a real
   * key and not about `undefined`.
   */
  if (!canEoRecordType(recordType.key, "create")) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t(
                  "eo.create.forbidden",
                  "You cannot create records of this type",
                )}
              </h3>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {t("eo.noTypeAccessHint")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typeName =
    localize(recordType as unknown as Record<string, unknown>, "name") ||
    recordType.name;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <Link
          to={`/eo/${recordType.key}`}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl:-rotate-180" />
          {typeName}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t("eo.create.title", {
            type: typeName,
            defaultValue: `New ${typeName}`,
          })}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t(
            "eo.create.subtitle",
            "Fields are defined by the record type and may be required at later stages too.",
          )}
        </p>
      </div>

      {hasParent && (
        <div className="rounded-xl border border-blue-300 dark:border-blue-700/60 bg-blue-50 dark:bg-blue-900/20 p-4">
          <div className="flex items-start gap-3">
            <Link2
              className="w-5 h-5 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0"
              aria-hidden="true"
            />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              {t("eo.create.underParent", {
                reference: parentRecord?.reference || parentId,
                defaultValue:
                  "This record will be created under {{reference}}.",
              })}
            </p>
          </div>
        </div>
      )}

      <EoRecordForm
        recordType={recordType}
        submitLabel={t("eo.create.submit", "Create record")}
        isSubmitting={createRecord.isPending}
        onSubmit={handleSubmit}
        cancelTo={
          // Cancelling a child create returns to the record it was started
          // from, not to the child type's register, which the user was never
          // on and has no reason to land in.
          hasParent && parentTypeKey
            ? `/eo/${parentTypeKey}/${parentId}`
            : `/eo/${recordType.key}`
        }
      />
    </div>
  );
};

export default EoRecordCreatePage;
