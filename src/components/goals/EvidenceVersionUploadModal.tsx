import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Upload, FileText, Loader2 } from "lucide-react";
import { useUploadVersion } from "../../hooks/useDocuments";

interface EvidenceVersionUploadModalProps {
  fileId: string;
  currentFileName: string;
  onClose: () => void;
}

export default function EvidenceVersionUploadModal({
  fileId,
  currentFileName,
  onClose,
}: EvidenceVersionUploadModalProps) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadVersion = useUploadVersion();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (!selectedFile) return;
    uploadVersion.mutate(
      { fileId, file: selectedFile, description: description.trim() },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md mx-4 rounded-xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("goals.components.evidence.versionUploadModal.title")}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <FileText size={16} />
            <span>
              {t("goals.components.evidence.versionUploadModal.currentFile")}{" "}
              <strong>{currentFileName}</strong>
            </span>
          </div>

          <div
            className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            {selectedFile ? (
              <div className="space-y-1">
                <FileText size={32} className="mx-auto text-blue-500 mb-2" />
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload size={32} className="mx-auto text-slate-300" />
                <p className="text-sm text-slate-500">
                  {t(
                    "goals.components.evidence.versionUploadModal.selectFile",
                  )}
                </p>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="version-description"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t("goals.components.evidence.versionUploadModal.descriptionLabel")}{" "}
              <span className="text-slate-400">
                {t("goals.components.evidence.versionUploadModal.optional")}
              </span>
            </label>
            <textarea
              id="version-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                "goals.components.evidence.versionUploadModal.descriptionPlaceholder",
              )}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || uploadVersion.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {uploadVersion.isPending && (
              <Loader2 size={14} className="animate-spin" />
            )}
            {t("goals.components.evidence.versionUploadModal.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
