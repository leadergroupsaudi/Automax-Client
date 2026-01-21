import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'xlsx' | 'pdf', options: ExportOptions) => Promise<void>;
  isExporting: boolean;
  dataSourceLabel: string;
  recordCount: number;
}

interface ExportOptions {
  title: string;
  includeFilters: boolean;
  includeTimestamp: boolean;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  isExporting,
  dataSourceLabel,
  recordCount,
}) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [title, setTitle] = useState(`${dataSourceLabel} Report`);
  const [includeFilters, setIncludeFilters] = useState(true);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);

  const handleExport = async () => {
    await onExport(format, { title, includeFilters, includeTimestamp });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[hsl(var(--primary)/0.1)]">
              <Download className="w-5 h-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{t('reports.exportDialog.title')}</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {recordCount.toLocaleString()} {t('reports.exportDialog.records')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
              {t('reports.exportDialog.exportFormat')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
                  format === 'xlsx'
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]"
                )}
              >
                <FileSpreadsheet className={cn(
                  "w-8 h-8",
                  format === 'xlsx' ? "text-green-600" : "text-[hsl(var(--muted-foreground))]"
                )} />
                <div className="ltr:text-left rtl:text-right">
                  <p className="font-medium text-[hsl(var(--foreground))]">{t('reports.exportDialog.excel')}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('reports.exportDialog.xlsxFormat')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
                  format === 'pdf'
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]"
                )}
              >
                <FileText className={cn(
                  "w-8 h-8",
                  format === 'pdf' ? "text-red-600" : "text-[hsl(var(--muted-foreground))]"
                )} />
                <div className="ltr:text-left rtl:text-right">
                  <p className="font-medium text-[hsl(var(--foreground))]">{t('reports.exportDialog.pdf')}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('reports.exportDialog.pdfFormat')}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
              {t('reports.exportDialog.reportTitle')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('reports.exportDialog.reportTitlePlaceholder')}
              className="w-full px-4 py-2.5 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)]"
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-[hsl(var(--muted)/0.5)] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={includeFilters}
                onChange={(e) => setIncludeFilters(e.target.checked)}
                className="w-4 h-4 text-[hsl(var(--primary))] border-[hsl(var(--border))] rounded"
              />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">{t('reports.exportDialog.includeFilterSummary')}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {t('reports.exportDialog.includeFilterSummaryDesc')}
                </p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-[hsl(var(--muted)/0.5)] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={includeTimestamp}
                onChange={(e) => setIncludeTimestamp(e.target.checked)}
                className="w-4 h-4 text-[hsl(var(--primary))] border-[hsl(var(--border))] rounded"
              />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">{t('reports.exportDialog.includeTimestamp')}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {t('reports.exportDialog.includeTimestampDesc')}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            {t('reports.exportDialog.cancel')}
          </Button>
          <Button
            onClick={handleExport}
            isLoading={isExporting}
            leftIcon={!isExporting ? <Download className="w-4 h-4" /> : undefined}
          >
            {isExporting ? t('reports.exportDialog.exporting') : `${t('common.export')} ${format.toUpperCase()}`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
