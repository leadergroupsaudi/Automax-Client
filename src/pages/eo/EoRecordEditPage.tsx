import React, { useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useEoRecord,
  useEoRecordTypes,
  useUpdateEoRecord,
} from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { usePermissions } from "../../hooks/usePermissions";
import { EoRecordForm } from "../../components/eo/EoRecordForm";
import type { EoMissingFieldsState, EoValues } from "../../types/eoRecord";

export const EoRecordEditPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { typeKey, id } = useParams<{ typeKey: string; id: string }>();
  const localize = useLocalizedField();
  const { canEoRecordType } = usePermissions();
  /**
   * The fields a refused transition named, when the actor arrived through the
   * Move record dialog's "Open the edit form". Absent on an ordinary edit.
   */
  const missing = (useLocation().state as EoMissingFieldsState | null)
    ?.eoMissing;

  const recordQuery = useEoRecord(id ?? "");
  const record = recordQuery.data?.data;

  const typesQuery = useEoRecordTypes();
  const recordType = useMemo(
    () =>
      record
        ? (typesQuery.data?.data ?? []).find(
            (rt) => rt.id === record.record_type_id,
          )
        : undefined,
    [typesQuery.data, record],
  );

  const updateRecord = useUpdateEoRecord();

  const handleSubmit = async (values: EoValues) => {
    if (!record || !recordType) return;
    await updateRecord.mutateAsync({
      id: record.id,
      // The PUT is a partial edit server-side, but the form always sends the
      // whole writable field set — see buildValuesPayload for why omitting a
      // key a conditional rule references turns a 400 into a 500.
      data: { record_type_id: recordType.id, values },
    });
    toast.success(t("eo.edit.success", "Record updated"));
    navigate(`/eo/${typeKey ?? recordType.key}/${record.id}`);
  };

  if (recordQuery.isLoading || typesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!record || !recordType) {
    return (
      <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-300">
            {t("eo.detail.notFound", "Record not found")}
          </p>
        </div>
      </div>
    );
  }

  /**
   * The PAGE-LEVEL per-type guard. The route is gated on `eo:view` alone
   * (PermissionRoute in App.tsx), which every EO user holds, so without this
   * the page rendered a full edit form for a type the caller holds no
   * `eo:<key>:update` code on — and the server answered 403 only after it
   * had been filled in. It is reached after the catalogue has settled and
   * `recordType` is a fact, so `canEoRecordType` is answering about a real
   * key and not about `undefined`.
   */
  if (!canEoRecordType(recordType.key, "update")) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t("eo.edit.forbidden", "You cannot edit records of this type")}
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

  const detailPath = `/eo/${typeKey ?? recordType.key}/${record.id}`;
  const subject =
    localize(record as unknown as Record<string, unknown>, "subject") ||
    record.subject_en ||
    record.subject_ar ||
    record.reference;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <Link
          to={detailPath}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl:-rotate-180" />
          {record.reference}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t("eo.edit.title", "Edit record")}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {subject}
        </p>
      </div>

      <EoRecordForm
        recordType={recordType}
        record={record}
        submitLabel={t("eo.edit.submit", "Save changes")}
        isSubmitting={updateRecord.isPending}
        onSubmit={handleSubmit}
        cancelTo={detailPath}
        requiredForTransition={missing}
      />
    </div>
  );
};

export default EoRecordEditPage;
