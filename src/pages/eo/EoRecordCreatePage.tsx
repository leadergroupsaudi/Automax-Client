import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useEoRecordTypes, useCreateEoRecord } from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { EoRecordForm } from "../../components/eo/EoRecordForm";
import type { EoValues } from "../../types/eoRecord";

export const EoRecordCreatePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { typeKey } = useParams<{ typeKey: string }>();
  const localize = useLocalizedField();

  const typesQuery = useEoRecordTypes();
  const recordType = useMemo(
    () =>
      (typesQuery.data?.data ?? []).find(
        (rt) => rt.key === typeKey && !rt.is_abstract,
      ),
    [typesQuery.data, typeKey],
  );

  const createRecord = useCreateEoRecord();

  const handleSubmit = async (values: EoValues) => {
    if (!recordType) return;
    const res = await createRecord.mutateAsync({
      record_type_id: recordType.id,
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

      <EoRecordForm
        recordType={recordType}
        submitLabel={t("eo.create.submit", "Create record")}
        isSubmitting={createRecord.isPending}
        onSubmit={handleSubmit}
        cancelTo={`/eo/${recordType.key}`}
      />
    </div>
  );
};

export default EoRecordCreatePage;
