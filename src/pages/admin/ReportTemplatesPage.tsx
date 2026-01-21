import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileBarChart,
  Plus,
  MoreHorizontal,
  Edit2,
  Trash2,
  Copy,
  Globe,
  Lock,
  User,
  Calendar,
  AlertCircle,
  FileText,
  Users,
  Building2,
  MapPin,
  GitBranch,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../components/ui';
import { reportApi } from '../../api/admin';
import type { ReportTemplate, ReportDataSource } from '../../types';

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

export const ReportTemplatesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterSource, setFilterSource] = useState<ReportDataSource | ''>('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'templates', filterSource],
    queryFn: () => reportApi.listTemplates(filterSource || undefined),
  });

  const templates = templatesData?.data || [];

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'templates'] });
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => reportApi.duplicateTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'templates'] });
    },
  });

  const handleDelete = (template: ReportTemplate) => {
    if (confirm(`${t('reports.deleteConfirm')} "${template.name}"?`)) {
      deleteMutation.mutate(template.id);
    }
    setActiveMenu(null);
  };

  const handleDuplicate = (template: ReportTemplate) => {
    duplicateMutation.mutate(template.id);
    setActiveMenu(null);
  };

  const handleEdit = (template: ReportTemplate) => {
    navigate(`/admin/reports/builder/${template.id}`);
  };

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeMenu]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500">
              <FileBarChart className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('reports.templates')}</h1>
          </div>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 ltr:ml-12 rtl:mr-12">
            {t('reports.templatesSubtitle')}
          </p>
        </div>

        <Button
          onClick={() => navigate('/admin/reports/builder')}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          {t('reports.newReport')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value as ReportDataSource | '')}
          className="px-4 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)]"
        >
          <option value="">{t('reports.allDataSources')}</option>
          {Object.entries(dataSourceInfo).map(([key, info]) => (
            <option key={key} value={key}>
              {t(info.labelKey)}
            </option>
          ))}
        </select>

        <span className="text-sm text-[hsl(var(--muted-foreground))]">
          {templates.length} {templates.length !== 1 ? t('reports.templates_count') : t('reports.template')}
        </span>
      </div>

      {/* Templates grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--primary))]" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))]">
          <FileBarChart className="w-12 h-12 text-[hsl(var(--muted-foreground))] mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[hsl(var(--foreground))] mb-2">
            {t('reports.noTemplatesYet')}
          </h3>
          <p className="text-[hsl(var(--muted-foreground))] mb-4">
            {t('reports.createFirstTemplate')}
          </p>
          <Button onClick={() => navigate('/admin/reports/builder')}>
            {t('reports.createReport')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const sourceInfo = dataSourceInfo[template.data_source];
            const Icon = iconMap[sourceInfo.icon] || FileBarChart;

            return (
              <div
                key={template.id}
                className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden hover:shadow-md transition-shadow"
              >
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

                    {/* Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === template.id ? null : template.id);
                        }}
                        className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-lg transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {activeMenu === template.id && (
                        <div className="absolute ltr:right-0 rtl:left-0 mt-1 w-40 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-lg z-10">
                          <button
                            onClick={() => handleEdit(template)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                            {t('reports.edit')}
                          </button>
                          <button
                            onClick={() => handleDuplicate(template)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                            {t('reports.duplicate')}
                          </button>
                          <hr className="my-1 border-[hsl(var(--border))]" />
                          <button
                            onClick={() => handleDelete(template)}
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

                {/* Card body */}
                <div className="p-4 space-y-3">
                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                    <span>{template.config.columns.length} columns</span>
                    <span>{template.config.filters.length} filters</span>
                    <span>{template.config.sorting.length} sorts</span>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                      {template.is_public ? (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {t('reports.public')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          {t('reports.private')}
                        </span>
                      )}
                      {template.created_by && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {template.created_by.username}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(template.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Card footer */}
                <div className="px-4 py-3 bg-[hsl(var(--muted)/0.3)] border-t border-[hsl(var(--border))]">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleEdit(template)}
                  >
                    {t('reports.openReportBuilder')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReportTemplatesPage;
