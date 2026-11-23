import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Eye,
  Info,
  Loader2,
  Paperclip,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFileExtension } from "@/utils/attachmentPolicy";
import { AttachmentDropzone } from "../attachments/AttachmentUpload";
import {
  useEoDocumentaStatus,
  useEoFileActions,
  useUploadEoRecordFile,
} from "../../hooks/useEoRecords";
import {
  eoErrorMessage,
  eoErrorStatus,
  toFileIdList,
} from "../../lib/eoFields";

/** Name and size of a file this session uploaded; the record stores neither. */
interface EoFileMeta {
  name: string;
  size: number;
}

/** A file whose bytes are still in flight. */
interface PendingUpload extends EoFileMeta {
  key: string;
}

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const extChip = (name: string): string =>
  getFileExtension(name).toUpperCase().slice(0, 4) || "FILE";

// ════════════════════════════════════════════════════════════════════════════
// One row
// ════════════════════════════════════════════════════════════════════════════

interface EoFileRowProps {
  name: string;
  detail?: string;
  tone?: "normal" | "pending" | "error";
  busy?: boolean;
  children?: React.ReactNode;
}

const EoFileRow: React.FC<EoFileRowProps> = ({
  name,
  detail,
  tone = "normal",
  busy = false,
  children,
}) => (
  <div
    className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl border",
      tone === "error"
        ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10"
        : "border-[hsl(var(--border))] bg-[hsl(var(--card))]",
    )}
  >
    <div
      className={cn(
        "w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold",
        tone === "error"
          ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300"
          : "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]",
      )}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        extChip(name) || "FILE"
      )}
    </div>
    <div className="min-w-0 flex-1 text-start">
      <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
        {name}
      </p>
      {detail && (
        <p
          className={cn(
            "text-xs truncate",
            tone === "error"
              ? "text-red-600 dark:text-red-400"
              : tone === "pending"
                ? "text-amber-600 dark:text-amber-400"
                : "text-[hsl(var(--muted-foreground))]",
          )}
        >
          {detail}
        </p>
      )}
    </div>
    <div className="flex items-center gap-1 shrink-0">{children}</div>
  </div>
);

const iconButtonClasses =
  "p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-40";

// ════════════════════════════════════════════════════════════════════════════
// Read-only links (detail page, and any saved id)
// ════════════════════════════════════════════════════════════════════════════

interface EoFileLinksProps {
  /** The record the files are filed on. Without it nothing can be opened. */
  recordId?: string;
  ids: string[];
  /** Names known from this session's uploads; a loaded record has none. */
  names?: Record<string, string>;
}

/**
 * The saved attachments of one field, as things a person can open.
 *
 * A record stores only the Documenta file id and there is no list-files
 * route, so a page that has not just uploaded the file knows no name for it —
 * hence "Attachment 1" plus the id's first characters, which is still an
 * identity a reader can match against Documenta.
 */
export const EoFileLinks: React.FC<EoFileLinksProps> = ({
  recordId,
  ids,
  names,
}) => {
  const { t } = useTranslation();
  const { download, preview, busyId } = useEoFileActions(recordId);

  if (ids.length === 0) return null;

  if (!recordId) {
    return (
      <span className="text-sm text-[hsl(var(--foreground))]">
        {t("eo.file.attachedCount", "{{n}} file(s) attached", {
          n: ids.length,
        })}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {ids.map((fileId, index) => (
        <EoFileRow
          key={fileId}
          name={
            names?.[fileId] ??
            t("eo.file.numbered", "Attachment {{n}}", { n: index + 1 })
          }
          detail={fileId.slice(0, 8)}
          busy={busyId === fileId}
        >
          <button
            type="button"
            onClick={() => preview(fileId)}
            disabled={busyId === fileId}
            title={t("eo.file.preview", "Preview")}
            aria-label={t("eo.file.preview", "Preview")}
            className={iconButtonClasses}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => download(fileId, names?.[fileId])}
            disabled={busyId === fileId}
            title={t("eo.file.download", "Download")}
            aria-label={t("eo.file.download", "Download")}
            className={iconButtonClasses}
          >
            <Download className="w-4 h-4" />
          </button>
        </EoFileRow>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// The field
// ════════════════════════════════════════════════════════════════════════════

interface EoFileFieldProps {
  id?: string;
  /** kind === "multi_file". */
  multiple: boolean;
  /** The form's current value: one id, a list of ids, or "". */
  value: unknown;
  // eslint-disable-next-line no-unused-vars
  onChange: (next: string | string[]) => void;
  /**
   * The record the file is filed on. Undefined on a create form — the upload
   * route needs a record id and there is none until the record exists.
   */
  recordId?: string;
  /**
   * The ids the SAVED record holds for this field. An id that is only in
   * `value` has been uploaded but not yet saved, and the read routes answer
   * 404 for it, so it gets no download link until the form is saved.
   */
  persistedIds: string[];
  invalid?: boolean;
  disabled?: boolean;
}

interface FailedUpload {
  key: string;
  name: string;
  message: string;
}

/**
 * The upload control for a `file` / `multi_file` EO field.
 *
 * It replaces a text box that asked an office user to paste a Documenta file
 * id — which is what the field stores, and which no office user has ever
 * seen. The id is still what travels to the server; it is just no longer the
 * user's problem.
 *
 * Three facts of the backend contract shape it:
 *
 *  1. THE UPLOAD NEEDS A RECORD ID. POST /eo-records/:id/files files into that
 *     record's own Documenta folder and creates nothing, so on a create form
 *     there is nothing to upload against. This field therefore does not offer
 *     a picker it cannot honour: before the first save it says the record must
 *     be saved first. Staging the bytes in the browser instead would mean
 *     creating the record, then uploading, then saving again — and on this
 *     deployment, where Documenta is off, that path would always leave a
 *     half-created record holding a file it never got.
 *
 *  2. A FILE IS ONLY READABLE ONCE THE RECORD IS SAVED WITH ITS ID. The read
 *     routes answer from the record's stored values, so between the 201 and
 *     the save there is nothing to link to. Those rows show the local name and
 *     size and a remove action; the links appear only for `persistedIds`.
 *
 *  3. DOCUMENTA MAY BE OFF. The 503 names EO_DOCUMENTA_ENABLED=false and is
 *     the pilot's actual behaviour today, so it is a state and not an error:
 *     the field explains it in the reader's language, keeps the server's own
 *     sentence underneath, and leaves the rest of the form working.
 */
export const EoFileField: React.FC<EoFileFieldProps> = ({
  id,
  multiple,
  value,
  onChange,
  recordId,
  persistedIds,
  invalid = false,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const documenta = useEoDocumentaStatus();
  const uploadFile = useUploadEoRecordFile();
  const { download, preview, busyId } = useEoFileActions(recordId);

  /** Names and sizes learnt from this session's 201s, keyed by file id. */
  const [meta, setMeta] = useState<Record<string, EoFileMeta>>({});
  const [uploading, setUploading] = useState<PendingUpload[]>([]);
  const [failed, setFailed] = useState<FailedUpload[]>([]);

  const ids = toFileIdList(value);
  const saved = new Set(persistedIds);

  const commit = (next: string[]) =>
    onChange(multiple ? next : (next[0] ?? ""));

  const handleFiles = async (picked: File[]) => {
    if (!recordId || disabled) return;
    const batch = multiple ? picked : picked.slice(0, 1);
    // The ids are accumulated locally: `value` is this render's prop and would
    // still hold the pre-upload list on the second file of a batch.
    let current = toFileIdList(value);
    for (const file of batch) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      // The server refuses a zero-byte file so that a required attachment
      // cannot be satisfied with nothing; saying so here saves the round trip
      // and keeps the two answers identical.
      if (file.size <= 0) {
        setFailed((prev) => [
          ...prev,
          {
            key,
            name: file.name,
            message: t("eo.file.empty", "This file is empty (0 bytes)."),
          },
        ]);
        continue;
      }
      setUploading((prev) => [
        ...prev,
        { key, name: file.name, size: file.size },
      ]);
      try {
        const res = await uploadFile.mutateAsync({ recordId, file });
        const uploaded = res?.data;
        if (!uploaded?.documenta_file_id)
          throw new Error("missing documenta_file_id");
        setMeta((prev) => ({
          ...prev,
          [uploaded.documenta_file_id]: {
            name: uploaded.file_name || file.name,
            size: uploaded.file_size ?? file.size,
          },
        }));
        current = multiple
          ? [...current, uploaded.documenta_file_id].filter(
              (v, i, a) => a.indexOf(v) === i,
            )
          : [uploaded.documenta_file_id];
        commit(current);
      } catch (error: unknown) {
        setFailed((prev) => [
          ...prev,
          {
            key,
            name: file.name,
            // Verbatim, because the 409 names the record and the 502 names
            // the id Documenta returned — paraphrasing either would cost the
            // operator the only handle they have. The 503 is the exception:
            // the notice above the list already carries that sentence, and
            // repeating it under every file turns one fact into a wall.
            message:
              eoErrorStatus(error) === 503
                ? t("eo.file.notAttached", "Not attached")
                : eoErrorMessage(
                    error,
                    t("eo.file.uploadFailed", "The file could not be uploaded"),
                  ),
          },
        ]);
      } finally {
        setUploading((prev) => prev.filter((u) => u.key !== key));
      }
    }
  };

  const remove = (fileId: string) => {
    commit(ids.filter((v) => v !== fileId));
  };

  const busy = uploading.length > 0;

  return (
    <div id={id} className="flex flex-col gap-2">
      {!recordId ? (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-start">
            {t(
              "eo.file.saveFirst",
              "Save the record first — files can be attached from the record once it exists.",
            )}
          </p>
        </div>
      ) : !documenta.available ? (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-start min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {t(
                "eo.file.storageOff",
                "Document storage is not set up for the Executive Office, so files cannot be attached yet.",
              )}
            </p>
            {documenta.message && (
              <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-400/90 break-words">
                {documenta.message}
              </p>
            )}
          </div>
        </div>
      ) : (
        <AttachmentDropzone
          policy={{
            allowedHint: "",
            limitsHint: multiple
              ? t("eo.file.hintMulti", "Each file is filed on this record.")
              : t("eo.file.hintSingle", "One file is filed on this record."),
          }}
          multiple={multiple}
          disabled={disabled || busy}
          hasError={invalid}
          busyText={busy ? t("eo.file.uploading", "Uploading…") : undefined}
          onFiles={handleFiles}
        />
      )}

      {uploading.map((u) => (
        <EoFileRow
          key={u.key}
          name={u.name}
          detail={`${formatSize(u.size)} · ${t("eo.file.uploading", "Uploading…")}`}
          busy
        />
      ))}

      {ids.map((fileId, index) => {
        const known = meta[fileId];
        const isSaved = saved.has(fileId);
        return (
          <EoFileRow
            key={fileId}
            name={
              known?.name ??
              t("eo.file.numbered", "Attachment {{n}}", { n: index + 1 })
            }
            tone={isSaved ? "normal" : "pending"}
            busy={busyId === fileId}
            detail={
              isSaved
                ? [known && formatSize(known.size), fileId.slice(0, 8)]
                    .filter(Boolean)
                    .join(" · ")
                : [
                    known && formatSize(known.size),
                    t(
                      "eo.file.notSavedYet",
                      "Uploaded — save the record to keep it",
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
          >
            {isSaved && (
              <>
                <button
                  type="button"
                  onClick={() => preview(fileId)}
                  disabled={busyId === fileId}
                  title={t("eo.file.preview", "Preview")}
                  aria-label={t("eo.file.preview", "Preview")}
                  className={iconButtonClasses}
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => download(fileId, known?.name)}
                  disabled={busyId === fileId}
                  title={t("eo.file.download", "Download")}
                  aria-label={t("eo.file.download", "Download")}
                  className={iconButtonClasses}
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(fileId)}
                title={t("eo.file.remove", "Remove")}
                aria-label={t("eo.file.remove", "Remove")}
                className={cn(iconButtonClasses, "hover:text-red-500")}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </EoFileRow>
        );
      })}

      {failed.map((f) => (
        <EoFileRow key={f.key} name={f.name} detail={f.message} tone="error">
          <button
            type="button"
            onClick={() =>
              setFailed((prev) => prev.filter((x) => x.key !== f.key))
            }
            title={t("common.dismiss", "Dismiss")}
            aria-label={t("common.dismiss", "Dismiss")}
            className={cn(iconButtonClasses, "hover:text-red-500")}
          >
            <X className="w-4 h-4" />
          </button>
        </EoFileRow>
      ))}

      {recordId && ids.length === 0 && uploading.length === 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <Paperclip className="w-3 h-3" />
          {t("eo.file.none", "No file attached")}
        </p>
      )}
    </div>
  );
};

export default EoFileField;
