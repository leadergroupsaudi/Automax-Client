import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FileBarChart,
    MoreHorizontal,
    Edit2,
    Trash2,
    Copy,
    Globe,
    Lock,
    User,
    Calendar,
    Download,
    Play,
    ChevronDown,
    AlertCircle,
    FileText,
    Users,
    Building2,
    MapPin,
    GitBranch
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Modal, ModalBody, ModalHeader } from '@/components/ui';
import type { ReportTemplate, ReportDataSource, ReportFilter, ReportFieldDefinition, ReportQueryRequest } from '@/types';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import FilterBuilder from '@/components/reports/FilterBuilder';
import { DATA_SOURCES } from '@/constants/reportFields';
import { reportApi } from '@/api/admin';
import ReportPreview, { formatCellValue, getNestedValue, toHumanReadable } from './ReportPreview';
import ExportDialog from './ExportDialog';
import { useMutation } from '@tanstack/react-query';

interface ReportTemplateCardProps {
    template: ReportTemplate;
    onEdit: (template: ReportTemplate) => void;
    onDelete: (template: ReportTemplate) => void;
    onDuplicate: (template: ReportTemplate) => void;
    onExport?: (template: ReportTemplate) => void;
    dynamicOptionsMap: Record<string, { value: string; label: string }[]>;
}

const iconMap: Record<string, React.ElementType> = {
    AlertCircle,
    FileText,
    Users,
    Building2,
    MapPin,
    GitBranch,
};

const dataSourceInfo: Record<ReportDataSource, { labelKey: string; icon: string; color: string }> = {
    incidents: { labelKey: 'reports.dataSources.incidents', icon: 'AlertCircle', color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' },
    action_logs: { labelKey: 'reports.dataSources.actionLogs', icon: 'FileText', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
    users: { labelKey: 'reports.dataSources.users', icon: 'Users', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
    departments: { labelKey: 'reports.dataSources.departments', icon: 'Building2', color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400' },
    locations: { labelKey: 'reports.dataSources.locations', icon: 'MapPin', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
    workflows: { labelKey: 'reports.dataSources.workflows', icon: 'GitBranch', color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400' },
};

export const ReportTemplateCard: React.FC<ReportTemplateCardProps> = ({
    template,
    onEdit,
    onDelete,
    onDuplicate,
    onExport,
    dynamicOptionsMap
}) => {
    const { t } = useTranslation();
    const [activeMenu, setActiveMenu] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [filters, setFilters] = useState<ReportFilter[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [displayPage, setDisplayPage] = useState(1);
    const [dbTotalCount, setDbTotalCount] = useState(0);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [showExportDialog, setShowExportDialog] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const DISPLAY_SIZE = 50;

    const displayTotalPages = Math.ceil(previewData.length / DISPLAY_SIZE);
    const displayData = previewData.slice(
        (displayPage - 1) * DISPLAY_SIZE,
        displayPage * DISPLAY_SIZE,
    );

    // Initialize filters from template config
    useEffect(() => {
        if (template.config.filters) {
            setFilters(template.config.filters.map((f, i) => ({ ...f, id: i.toString() })));
        }
    }, [template]);

    const sourceInfo = dataSourceInfo[template.data_source];
    const Icon = iconMap[sourceInfo.icon] || FileBarChart;

    const getFieldsForDataSource = (dataSource: string): ReportFieldDefinition[] => {
        const source = DATA_SOURCES.find(ds => ds.key === dataSource);
        return source?.fields || [];
    };

    const getFields = (dataSource: ReportDataSource) => {
        const baseFields = dataSource ? getFieldsForDataSource(dataSource) : [];
        return baseFields.map((field) => {
            if (field.dynamicOptions && dynamicOptionsMap[field.dynamicOptions]) {
                return {
                    ...field,
                    options: dynamicOptionsMap[field.dynamicOptions],
                };
            }
            return field;
        });
    };

    // Generate report — fetches recordLimit rows in a single request, no server pagination
    const generateReport = useCallback(async () => {
        if (!template.data_source || template.config.columns.length === 0) return;

        setIsPreviewLoading(true);
        setDisplayPage(1);
        try {
            const response = await fetchReportData()
            setShowPreview(true)
            setPreviewData(response.data);
            setDbTotalCount(response.total_items);
            setTimeout(
                () =>
                    previewRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    }),
                100,
            );
        } catch (error) {
            console.error("Failed to generate report:", error);
        } finally {
            setIsPreviewLoading(false);
        }
    }, [template.data_source, template.config.columns, filters]);

    const fetchReportData = async () => {
        let dateFilter: ReportFilter[] = []
        if (fromDate && toDate) {
            dateFilter.push({
                id: "Created At",
                field: "Created At",
                operator: "between",
                value: {
                    "from": new Date(fromDate).toLocaleDateString("en-US"),
                    "to": new Date(toDate).toLocaleDateString("en-US")
                }
            })
        }
        const request: ReportQueryRequest = {
            data_source: template.data_source,
            columns: template.config.columns,
            filters: [...filters, ...dateFilter].map(({ field, operator, value }) => ({
                field,
                operator,
                value,
            })),
            sorting: [],
            page: 1,
            limit: 100,
        };

        const response = await reportApi.query(request);
        return response;
    }

    // Export mutation
    const exportMutation = useMutation({
        mutationFn: async ({
            format,
            options,
        }: {
            format: "xlsx" | "pdf";
            options: {
                title: string;
                includeFilters: boolean;
                includeTimestamp: boolean;
            };
        }) => {
            if (!template.data_source) throw new Error("No data source selected");
            await fetchReportData()
            // For Excel, use the already-fetched previewData (respects the configured recordLimit)
            if (format === "xlsx") {
                // Build headers — use field label, fall back to human-readable key
                const headers = template.config.columns.map((col) => {
                    const field = getFields(template.data_source).find((f) => f.field === col.field);
                    return field?.label || toHumanReadable(col.field);
                });

                // Build rows from previewData
                const rows = previewData.map((row) => {
                    return template.config.columns.map((col) => {
                        const fieldDef = getFields(template.data_source).find((f) => f.field === col.field);
                        const value = getNestedValue(row, col.field);
                        if (!fieldDef) return value == null ? "" : String(value);
                        return formatCellValue(value, fieldDef);
                    });
                });

                // Create worksheet
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Report");

                // Generate buffer
                const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                const blob = new Blob([excelBuffer], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                });

                // Download
                const filename = `${options.title.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
                saveAs(blob, filename);
            } else {
                // PDF - use server-side export
                const blob = await reportApi.export({
                    data_source: template.data_source,
                    columns: template.config.columns,
                    filters: filters.map(({ field, operator, value }) => ({
                        field,
                        operator,
                        value,
                    })),
                    sorting: [],
                    format: "pdf",
                    options,
                });
                const filename = `${options.title.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
                saveAs(blob, filename);
            }
        },
        onSuccess: () => {
            setShowExportDialog(false);
        },
    });

    return (
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
            {/* Card header */}
            <div className="p-4 border-b border-[hsl(var(--border))]">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", sourceInfo.color)}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-[hsl(var(--foreground))] line-clamp-1">
                                {template.name}
                            </h3>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                {t(sourceInfo.labelKey)}
                            </p>
                        </div>
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => setActiveMenu(!activeMenu)}
                            className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-lg transition-colors"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {activeMenu && (
                            <div className="absolute ltr:right-0 rtl:left-0 mt-1 w-40 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-lg z-10 py-1">
                                <button
                                    onClick={() => { onEdit(template); setActiveMenu(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                                >
                                    <Edit2 className="w-4 h-4" />
                                    {t('reports.edit')}
                                </button>
                                <button
                                    onClick={() => { onDuplicate(template); setActiveMenu(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                                >
                                    <Copy className="w-4 h-4" />
                                    {t('reports.duplicate')}
                                </button>
                                {onExport && (
                                    <button
                                        onClick={() => { onExport(template); setActiveMenu(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export with Template
                                    </button>
                                )}
                                <hr className="my-1 border-[hsl(var(--border))]" />
                                <button
                                    onClick={() => { onDelete(template); setActiveMenu(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {t('reports.delete')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {template.description && (
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 line-clamp-2">
                        {template.description}
                    </p>
                )}
            </div>

            {/* Generation Form */}
            <div className="p-4 space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label htmlFor={`from-${template.id}`} className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                            {t('common.fromDate')}
                        </label>
                        <input
                            id={`from-${template.id}`}
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full border border-[hsl(var(--border))] rounded-lg px-2 py-3 text-xs bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor={`to-${template.id}`} className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                            {t('common.toDate')}
                        </label>
                        <input
                            id={`to-${template.id}`}
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full border border-[hsl(var(--border))] rounded-lg px-2 py-3 text-xs bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] outline-none"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
                    >
                        <ChevronDown className={cn("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                        {filters.length > 0 && <span className="bg-[hsl(var(--primary)/0.1)] px-1.5 py-0.5 rounded-full">{filters.length}</span>}
                    </button>

                    {showFilters && (
                        <div className="pt-2 border-t border-[hsl(var(--border))] border-dashed">
                            <FilterBuilder
                                fields={getFields(template.data_source)}
                                filters={filters}
                                onChange={setFilters}
                                enableAddFilter={false}
                            />
                        </div>
                    )}
                </div>
                <div className='flex gap-2 w-full'>
                    <Button
                        onClick={generateReport}
                        disabled={isGenerating}
                        isLoading={isGenerating}
                        className="w-full"
                        size="sm"
                        leftIcon={!isGenerating && <Play className="w-4 h-4" />}
                    >
                        {t('reports.generateReport')}
                    </Button>

                    <Button
                        onClick={() => setShowExportDialog(true)}
                        disabled={isGenerating}
                        isLoading={isGenerating}
                        className="w-full"
                        size="sm"
                        leftIcon={!isGenerating && <Download className="w-4 h-4" />}
                    >
                        {t('reports.export')}
                    </Button>
                </div>

            </div>

            {/* Card footer - Meta info */}
            <div className="px-4 py-3 bg-[hsl(var(--muted)/0.3)] border-t border-[hsl(var(--border))] space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[10px] text-[hsl(var(--muted-foreground))]">
                        {template.is_public ? (
                            <span className="flex items-center gap-1">
                                <Globe className="w-2.5 h-2.5" />
                                {t('reports.public')}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" />
                                {t('reports.private')}
                            </span>
                        )}
                        {template.created_by && (
                            <span className="flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />
                                {template.created_by.username}
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {new Date(template.created_at).toLocaleDateString()}
                    </span>
                </div>

                <Button
                    variant="outline"
                    size="lg"
                    className="w-full text-xs"
                    onClick={() => onEdit(template)}
                >
                    {t('reports.openReportBuilder')}
                </Button>
            </div>
            <Modal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                className='max-h-[90%] min-w-[80%]'
            >
                <ModalHeader>
                    {t('reports.preview')}
                </ModalHeader>
                <ModalBody>
                    {template.data_source && (previewData.length > 0 || isPreviewLoading) && (
                        <div
                            ref={previewRef}
                            className="border border-[hsl(var(--border))] rounded-xl overflow-hidden"
                        >
                            <div className="px-4 py-3 bg-[hsl(var(--muted)/0.3)] border-b border-[hsl(var(--border))] flex items-center justify-between gap-4">
                                <h2 className="font-semibold text-[hsl(var(--foreground))]">
                                    {t("reports.previewResults")}
                                </h2>
                                {previewData.length > 0 && (
                                    <span className="text-sm text-[hsl(var(--muted-foreground))]">
                                        {previewData.length < dbTotalCount ? (
                                            <>
                                                Fetched{" "}
                                                <strong>{previewData.length.toLocaleString()}</strong> of{" "}
                                                <strong>{dbTotalCount.toLocaleString()}</strong> total
                                                records
                                                {previewData.length < dbTotalCount && (
                                                    <span className="ltr:ml-1 rtl:mr-1 text-amber-600 dark:text-amber-400">
                                                        — increase limit to fetch more
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                All <strong>{previewData.length.toLocaleString()}</strong>{" "}
                                                records fetched
                                            </>
                                        )}
                                    </span>
                                )}
                            </div>
                            <div className="p-4">
                                <ReportPreview
                                    data={displayData}
                                    columns={template.config.columns}
                                    fields={getFields(template.data_source)}
                                    isLoading={isPreviewLoading}
                                    page={displayPage}
                                    limit={DISPLAY_SIZE}
                                    totalItems={previewData.length}
                                    totalPages={displayTotalPages}
                                    onPageChange={setDisplayPage}
                                />
                            </div>
                        </div>
                    )}
                </ModalBody>
            </Modal>

            {/* Export Dialog */}
            <ExportDialog
                isOpen={showExportDialog}
                onClose={() => setShowExportDialog(false)}
                onExport={(format, options) =>
                    exportMutation.mutateAsync({ format, options })
                }
                isExporting={exportMutation.isPending}
                dataSourceLabel={template.data_source}
                recordCount={previewData.length}
                previewData={previewData}
                columns={template.config.columns}
                fields={getFields(template.data_source)}
            />
        </div>
    );
};
