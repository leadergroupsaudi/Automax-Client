import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import type { EoFilePreviewState } from "../../hooks/useEoRecords";
import {
  eoDocumentaDisabledMessage,
  eoErrorMessage,
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
// The preview frame
// ════════════════════════════════════════════════════════════════════════════

interface EoFilePreviewFrameProps {
  preview: EoFilePreviewState;
  onClose: () => void;
}

/**
 * Shows a previewable file INSIDE A SANDBOXED FRAME, never in a window.
 *
 * `sandbox` is written with no value on purpose: that applies every
 * restriction, and the one that matters is the absence of
 * `allow-same-origin`. A blob: URL inherits the origin that created it — this
 * application's — so a document loaded from one in an ordinary window or
 * frame is first-party script. With this attribute the frame's document gets
 * an OPAQUE origin instead: no access to this origin, its localStorage (where
 * the JWT lives), its cookies, or `window.parent`. The allowlist in
 * useEoFileActions should mean nothing executable ever reaches here; this is
 * the layer that holds when it does.
 *
 * Adding `allow-same-origin` — or going back to `window.open` — reintroduces
 * stored XSS, and no amount of server-side CSP will catch it, because the
 * server's headers are gone the moment the bytes are re-wrapped as a blob.
 */
export const EoFilePreviewFrame: React.FC<EoFilePreviewFrameProps> = ({
  preview,
  onClose,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [onClose]);

  // Portalled to <body> for the reason components/ui/Modal.tsx gives: the
  // page wrapper's stacking context otherwise leaves the layout's sidebar
  // painted over the overlay, whatever z-index it carries.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={preview.name}
      className="fixed inset-0 z-[1001] flex flex-col bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col flex-1 min-h-0 w-full max-w-5xl mx-auto rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--border))]">
          <Paperclip className="w-4 h-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
          <div className="min-w-0 flex-1 text-start">
            <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
              {preview.name}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {preview.type}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
            className={cn(iconButtonClasses, "hover:text-red-500")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <iframe
          data-testid="eo-file-preview-frame"
          title={preview.name}
          src={preview.url}
          sandbox=""
          referrerPolicy="no-referrer"
          className="flex-1 w-full bg-white"
        />
      </div>
    </div>,
    document.body,
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Read-only links (detail page, and any saved id)
// ════════════════════════════════════════════════════════════════════════════

interface EoFileLinksProps {
  /** The record the files are filed on. Without it nothing can be opened. */
  recordId?: string;
  ids: string[];
}

/**
 * The saved attachments of one field, as things a person can open.
 *
 * A record stores only the Documenta file id and there is no list-files
 * route, so a page that has not just uploaded the file knows no name for it —
 * hence "Attachment 1" plus the id's first characters, which is still an
 * identity a reader can match against Documenta.
 */
export const EoFileLinks: React.FC<EoFileLinksProps> = ({ recordId, ids }) => {
  const { t } = useTranslation();
  const { download, openPreview, closePreview, preview, busyId } =
    useEoFileActions(recordId);

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
          name={t("eo.file.numbered", "Attachment {{n}}", { n: index + 1 })}
          detail={fileId.slice(0, 8)}
          busy={busyId === fileId}
        >
          <button
            type="button"
            onClick={() => openPreview(fileId)}
            disabled={busyId === fileId}
            title={t("eo.file.preview", "Preview")}
            aria-label={t("eo.file.preview", "Preview")}
            className={iconButtonClasses}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => download(fileId)}
            disabled={busyId === fileId}
            title={t("eo.file.download", "Download")}
            aria-label={t("eo.file.download", "Download")}
            className={iconButtonClasses}
          >
            <Download className="w-4 h-4" />
          </button>
        </EoFileRow>
      ))}
      {preview && (
        <EoFilePreviewFrame preview={preview} onClose={closePreview} />
      )}
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
  const { download, openPreview, closePreview, preview, busyId } =
    useEoFileActions(recordId);

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
            // operator the only handle they have. The DEPLOYMENT refusal is
            // the one exception: the notice above the list already carries
            // that sentence, and repeating it under every file turns one
            // fact into a wall. A bare 503 from a proxy is NOT that refusal
            // and gets the ordinary treatment, because nothing above the
            // list is explaining it.
            message: eoDocumentaDisabledMessage(error)
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
      ) : (
        <>
          {/*
            The notice sits ABOVE the dropzone rather than replacing it. The
            flag is only ever cleared by a SUCCESSFUL upload, so a field that
            hides its picker while the flag is set can never clear it: one
            refusal would disable attachments for the rest of the page's life.
            Leaving the picker means a retry is always one click away, and a
            deployment that really is misconfigured simply refuses again.
          */}
          {!documenta.available && (
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
          )}
          <AttachmentDropzone
            policy={{
              allowedHint: "",
              limitsHint: documenta.available
                ? multiple
                  ? t("eo.file.hintMulti", "Each file is filed on this record.")
                  : t("eo.file.hintSingle", "One file is filed on this record.")
                : t("eo.file.retryHint", "Try again if this has been fixed."),
            }}
            multiple={multiple}
            disabled={disabled || busy}
            hasError={invalid}
            busyText={busy ? t("eo.file.uploading", "Uploading…") : undefined}
            onFiles={handleFiles}
          />
        </>
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
                  onClick={() => openPreview(fileId, known?.name)}
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

      {preview && (
        <EoFilePreviewFrame preview={preview} onClose={closePreview} />
      )}
    </div>
  );
};

export default EoFileField;
