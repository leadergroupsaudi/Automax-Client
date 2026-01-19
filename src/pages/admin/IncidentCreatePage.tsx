import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, AlertTriangle, Info, Zap } from 'lucide-react';
import { Button, Card, Input, Select, Textarea } from '../../components/ui';
import { workflowApi, classificationApi, incidentApi } from '../../api/admin';
import { userApi, departmentApi, locationApi } from '../../api/admin';
import type { IncidentCreateRequest, User, Department, Location, Workflow, Classification, IncidentSource } from '../../types';
import { INCIDENT_SOURCES } from '../../types';

export function IncidentCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<IncidentCreateRequest>({
    title: '',
    description: '',
    workflow_id: '',
    classification_id: '',
    priority: 3,
    severity: 3,
    source: undefined,
    assignee_id: '',
    department_id: '',
    location_id: '',
    due_date: '',
    reporter_name: '',
    reporter_email: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoMatchedWorkflow, setAutoMatchedWorkflow] = useState<Workflow | null>(null);
  const [isAutoMatched, setIsAutoMatched] = useState(false);

  // Fetch workflows
  const { data: workflowsData } = useQuery({
    queryKey: ['admin', 'workflows', 'active'],
    queryFn: () => workflowApi.list(true),
  });

  // Fetch classifications
  const { data: classificationsData } = useQuery({
    queryKey: ['admin', 'classifications'],
    queryFn: () => classificationApi.list(),
  });

  // Fetch users for assignee
  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => userApi.list(1, 100),
  });

  // Fetch departments
  const { data: departmentsData } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => departmentApi.list(),
  });

  // Fetch locations
  const { data: locationsData } = useQuery({
    queryKey: ['admin', 'locations'],
    queryFn: () => locationApi.list(),
  });

  const workflows: Workflow[] = workflowsData?.data || [];
  const classifications: Classification[] = classificationsData?.data || [];
  const users: User[] = usersData?.data || [];
  const departments: Department[] = departmentsData?.data || [];
  const locations: Location[] = locationsData?.data || [];

  // Auto-match workflow based on criteria
  const matchWorkflow = useCallback(() => {
    if (workflows.length === 0) return;

    const matched = workflowApi.findMatchingWorkflow(workflows, {
      classification_id: formData.classification_id || undefined,
      location_id: formData.location_id || undefined,
      source: formData.source || undefined,
      severity: formData.severity,
      priority: formData.priority,
    });

    if (matched) {
      setAutoMatchedWorkflow(matched);
      // Only auto-set if user hasn't manually selected a workflow
      if (!formData.workflow_id || isAutoMatched) {
        setFormData(prev => ({ ...prev, workflow_id: matched.id }));
        setIsAutoMatched(true);
      }
    }
  }, [workflows, formData.classification_id, formData.location_id, formData.source, formData.severity, formData.priority, formData.workflow_id, isAutoMatched]);

  // Trigger auto-match when relevant fields change
  useEffect(() => {
    matchWorkflow();
  }, [matchWorkflow]);

  const createMutation = useMutation({
    mutationFn: (data: IncidentCreateRequest) => incidentApi.create(data),
    onSuccess: (response) => {
      // Invalidate all incident-related queries
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (response.data) {
        navigate(`/incidents/${response.data.id}`);
      } else {
        navigate('/incidents');
      }
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to create incident';
      setErrors({ submit: message });
    },
  });

  const handleChange = (field: keyof IncidentCreateRequest, value: string | number | IncidentSource | undefined) => {
    // If user manually selects workflow, mark as not auto-matched
    if (field === 'workflow_id' && value) {
      setIsAutoMatched(false);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Get the selected workflow to check required fields
  const selectedWorkflow = workflows.find(w => w.id === formData.workflow_id);
  const workflowRequiredFields = selectedWorkflow?.required_fields || [];

  // Field label mapping for error messages
  const fieldLabels: Record<string, string> = {
    description: 'Description',
    classification_id: 'Classification',
    priority: 'Priority',
    severity: 'Severity',
    source: 'Source',
    assignee_id: 'Assignee',
    department_id: 'Department',
    location_id: 'Location',
    due_date: 'Due Date',
    reporter_name: 'Reporter Name',
    reporter_email: 'Reporter Email',
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = t('incidents.titleRequired');
    }

    if (!formData.workflow_id) {
      newErrors.workflow_id = t('incidents.workflowRequired');
    }

    // Validate workflow-specific required fields
    for (const field of workflowRequiredFields) {
      const value = formData[field as keyof typeof formData];
      if (!value || (typeof value === 'string' && !value.trim())) {
        newErrors[field] = t('incidents.fieldRequired', { field: fieldLabels[field] || field });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    // Clean up empty optional fields
    const submitData: IncidentCreateRequest = {
      title: formData.title,
      workflow_id: formData.workflow_id,
    };

    if (formData.description) submitData.description = formData.description;
    if (formData.classification_id) submitData.classification_id = formData.classification_id;
    if (formData.priority) submitData.priority = formData.priority;
    if (formData.severity) submitData.severity = formData.severity;
    if (formData.source) submitData.source = formData.source;
    if (formData.assignee_id) submitData.assignee_id = formData.assignee_id;
    if (formData.department_id) submitData.department_id = formData.department_id;
    if (formData.location_id) submitData.location_id = formData.location_id;
    // Convert datetime-local format to RFC3339 for backend
    if (formData.due_date) {
      const date = new Date(formData.due_date);
      submitData.due_date = date.toISOString();
    }
    if (formData.reporter_name) submitData.reporter_name = formData.reporter_name;
    if (formData.reporter_email) submitData.reporter_email = formData.reporter_email;

    createMutation.mutate(submitData);
  };

  const priorityOptions = [
    { value: '1', label: t('priorities.critical') },
    { value: '2', label: t('priorities.high') },
    { value: '3', label: t('priorities.medium') },
    { value: '4', label: t('priorities.low') },
    { value: '5', label: t('priorities.veryLow') },
  ];

  const severityOptions = [
    { value: '1', label: t('severities.critical') },
    { value: '2', label: t('severities.major') },
    { value: '3', label: t('severities.moderate') },
    { value: '4', label: t('severities.minor') },
    { value: '5', label: t('severities.cosmetic') },
  ];

  const sourceOptions = [
    { value: '', label: t('incidents.selectSource') },
    ...INCIDENT_SOURCES.map(s => ({ value: s.value, label: s.label })),
  ];

  const workflowOptions = [
    { value: '', label: t('incidents.selectWorkflow') },
    ...workflows.map(wf => ({ value: wf.id, label: wf.name })),
  ];

  const classificationOptions = [
    { value: '', label: t('incidents.selectClassification') },
    ...classifications.map(c => ({ value: c.id, label: c.name })),
  ];

  const userOptions = [
    { value: '', label: t('incidents.unassigned') },
    ...users.map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` })),
  ];

  const departmentOptions = [
    { value: '', label: t('incidents.noDepartment') },
    ...departments.map(d => ({ value: d.id, label: d.name })),
  ];

  const locationOptions = [
    { value: '', label: t('incidents.noLocation') },
    ...locations.map(l => ({ value: l.id, label: l.name })),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/incidents')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('incidents.createIncident')}</h1>
          <p className="text-gray-600">{t('incidents.createIncidentSubtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">{t('incidents.basicInformation')}</h2>

              <div className="space-y-4">
                <Input
                  label={t('incidents.incidentTitle')}
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  error={errors.title}
                  placeholder={t('incidents.titlePlaceholder')}
                  required
                />

                <Textarea
                  label={t('incidents.description')}
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder={t('incidents.descriptionPlaceholder')}
                  rows={5}
                  required={workflowRequiredFields.includes('description')}
                  error={errors.description}
                />

                {/* Workflow Matching Criteria */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">{t('incidents.autoWorkflowSelection')}</span>
                  </div>
                  <p className="text-xs text-blue-700 mb-3">
                    {t('incidents.autoWorkflowHint')}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label={t('incidents.classification')}
                      value={formData.classification_id || ''}
                      onChange={(e) => handleChange('classification_id', e.target.value)}
                      options={classificationOptions}
                      required={workflowRequiredFields.includes('classification_id')}
                      error={errors.classification_id}
                    />

                    <Select
                      label={t('incidents.location')}
                      value={formData.location_id || ''}
                      onChange={(e) => handleChange('location_id', e.target.value)}
                      options={locationOptions}
                      required={workflowRequiredFields.includes('location_id')}
                      error={errors.location_id}
                    />
                  </div>

                  <div className="mt-3">
                    <Select
                      label={t('incidents.source')}
                      value={formData.source || ''}
                      onChange={(e) => handleChange('source', e.target.value as IncidentSource || undefined)}
                      options={sourceOptions}
                      required={workflowRequiredFields.includes('source')}
                      error={errors.source}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label={t('incidents.priority')}
                    value={String(formData.priority || 3)}
                    onChange={(e) => handleChange('priority', parseInt(e.target.value))}
                    options={priorityOptions}
                    required={workflowRequiredFields.includes('priority')}
                    error={errors.priority}
                  />

                  <Select
                    label={t('incidents.severity')}
                    value={String(formData.severity || 3)}
                    onChange={(e) => handleChange('severity', parseInt(e.target.value))}
                    options={severityOptions}
                    required={workflowRequiredFields.includes('severity')}
                    error={errors.severity}
                  />
                </div>

                {/* Workflow Selection */}
                <div className="relative">
                  <Select
                    label={t('incidents.workflow')}
                    value={formData.workflow_id || ''}
                    onChange={(e) => handleChange('workflow_id', e.target.value)}
                    error={errors.workflow_id}
                    options={workflowOptions}
                    required
                  />
                  {isAutoMatched && autoMatchedWorkflow && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-green-600">
                      <Info className="w-3 h-3" />
                      <span>{t('incidents.autoMatchedHint')}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">{t('incidents.reporterInformation')}</h2>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('incidents.reporterName')}
                  value={formData.reporter_name || ''}
                  onChange={(e) => handleChange('reporter_name', e.target.value)}
                  placeholder={t('incidents.reporterNamePlaceholder')}
                  required={workflowRequiredFields.includes('reporter_name')}
                  error={errors.reporter_name}
                />

                <Input
                  label={t('incidents.reporterEmail')}
                  type="email"
                  value={formData.reporter_email || ''}
                  onChange={(e) => handleChange('reporter_email', e.target.value)}
                  placeholder={t('incidents.reporterEmailPlaceholder')}
                  required={workflowRequiredFields.includes('reporter_email')}
                  error={errors.reporter_email}
                />
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">{t('incidents.assignment')}</h2>

              <div className="space-y-4">
                <Select
                  label={t('incidents.assignee')}
                  value={formData.assignee_id || ''}
                  onChange={(e) => handleChange('assignee_id', e.target.value)}
                  options={userOptions}
                  required={workflowRequiredFields.includes('assignee_id')}
                  error={errors.assignee_id}
                />

                <Select
                  label={t('incidents.department')}
                  value={formData.department_id || ''}
                  onChange={(e) => handleChange('department_id', e.target.value)}
                  options={departmentOptions}
                  required={workflowRequiredFields.includes('department_id')}
                  error={errors.department_id}
                />

                <Input
                  label={t('incidents.dueDate')}
                  type="datetime-local"
                  value={formData.due_date || ''}
                  onChange={(e) => handleChange('due_date', e.target.value)}
                  required={workflowRequiredFields.includes('due_date')}
                  error={errors.due_date}
                />
              </div>
            </Card>

            {/* Actions */}
            <Card className="p-6">
              {errors.submit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">{errors.submit}</span>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  type="submit"
                  className="w-full"
                  leftIcon={<Save className="w-4 h-4" />}
                  isLoading={createMutation.isPending}
                >
                  {t('incidents.createIncident')}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/incidents')}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
