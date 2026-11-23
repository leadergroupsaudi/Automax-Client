import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useEoRecord,
  useEoRecordTypes,
  useUpdateEoRecord,
} from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { EoRecordForm } from "../../components/eo/EoRecordForm";
import type { EoValues } from "../../types/eoRecord";

export const EoRecordEditPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { typeKey, id } = useParams<{ typeKey: string; id: string }>();
  const localize = useLocalizedField();

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
      />
    </div>
  );
};

export default EoRecordEditPage;
