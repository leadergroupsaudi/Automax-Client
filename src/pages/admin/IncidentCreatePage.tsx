import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, AlertTriangle, Info, Zap } from 'lucide-react';
import { Button, Card, Input, Select, Textarea } from '../../components/ui';
import { workflowApi, classificationApi, incidentApi, lookupApi } from '../../api/admin';
import { userApi, departmentApi, locationApi } from '../../api/admin';
import type { IncidentCreateRequest, User, Department, Location, Workflow, Classification, IncidentSource, LookupValue } from '../../types';
import { INCIDENT_SOURCES } from '../../types';

export function IncidentCreatePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Omit<IncidentCreateRequest, 'lookup_value_ids'>>({
    title: '',
    description: '',
    workflow_id: '',
    classification_id: '',
    source: undefined,
    assignee_id: '',
    department_id: '',
    location_id: '',
    due_date: '',
    reporter_name: '',
    reporter_email: '',
  });

  const [lookupValues, setLookupValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoMatchedWorkflow, setAutoMatchedWorkflow] = useState<Workflow | null>(null);
  const [isAutoMatched, setIsAutoMatched] = useState(false);

  // Fetch data
  const { data: workflowsData } = useQuery({
    queryKey: ['admin', 'workflows', 'active'],
    queryFn: () => workflowApi.list(true),
  });

  const { data: classificationsData } = useQuery({
    queryKey: ['admin', 'classifications'],
    queryFn: () => classificationApi.list(),
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => userApi.list(1, 100),
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => departmentApi.list(),
  });

  const { data: locationsData } = useQuery({
    queryKey: ['admin', 'locations'],
    queryFn: () => locationApi.list(),
  });

  const { data: lookupCategoriesData } = useQuery({
    queryKey: ['admin', 'lookups', 'categories'],
    queryFn: () => lookupApi.listCategories(),
  });

  const workflows: Workflow[] = workflowsData?.data || [];
  const classifications: Classification[] = classificationsData?.data || [];
  const users: User[] = usersData?.data || [];
  const departments: Department[] = departmentsData?.data || [];
  const locations: Location[] = locationsData?.data || [];

  const incidentLookupCategories = (lookupCategoriesData?.data || []).filter(
    (cat) => cat.add_to_incident_form
  );


  const getLookupValueFromState = (categoryCode: string): LookupValue | undefined => {
    const category = incidentLookupCategories.find(c => c.code === categoryCode);
    if (!category || !lookupValues[category.id]) return undefined;
    return category.values?.find(v => v.id === lookupValues[category.id]);
  };
  
  const matchWorkflow = useCallback(() => {
    if (workflows.length === 0) return;
  
    const priorityValue = getLookupValueFromState('PRIORITY');
    const severityValue = getLookupValueFromState('SEVERITY');
  
    const matched = workflowApi.findMatchingWorkflow(workflows, {
      classification_id: formData.classification_id || undefined,
      location_id: formData.location_id || undefined,
      source: formData.source || undefined,
      priority: priorityValue ? priorityValue.sort_order : undefined,
      severity: severityValue ? severityValue.sort_order : undefined,
    });
  
    if (matched) {
      setAutoMatchedWorkflow(matched);
      if (!formData.workflow_id || isAutoMatched) {
        setFormData(prev => ({ ...prev, workflow_id: matched.id }));
        setIsAutoMatched(true);
      }
    }
  }, [workflows, formData.classification_id, formData.location_id, formData.source, lookupValues, isAutoMatched, formData.workflow_id]);
  
  useEffect(() => {
    matchWorkflow();
  }, [matchWorkflow]);

  const createMutation = useMutation({
    mutationFn: (data: IncidentCreateRequest) => incidentApi.create(data),
    onSuccess: (response) => {
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

  const handleChange = (field: keyof typeof formData, value: string | IncidentSource | undefined) => {
    if (field === 'workflow_id' && value) {
      setIsAutoMatched(false);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleLookupChange = (categoryId: string, valueId: string) => {
    setLookupValues(prev => ({ ...prev, [categoryId]: valueId }));
  };

  const selectedWorkflow = workflows.find(w => w.id === formData.workflow_id);
  const workflowRequiredFields = selectedWorkflow?.required_fields || [];

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = t('incidents.titleRequired');
    if (!formData.workflow_id) newErrors.workflow_id = t('incidents.workflowRequired');

    for (const field of workflowRequiredFields) {
      // Check for lookup field requirements (format: lookup:CATEGORY_CODE)
      if (field.startsWith('lookup:')) {
        const categoryCode = field.replace('lookup:', '');
        const category = incidentLookupCategories.find(c => c.code === categoryCode);
        if (category && !lookupValues[category.id]) {
          newErrors[field] = t('incidents.fieldRequired', { field: category.name });
        }
      } else {
        // Standard field validation
        const value = formData[field as keyof typeof formData];
        if (!value || (typeof value === 'string' && !value.trim())) {
          newErrors[field] = t('incidents.fieldRequired', { field });
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const submitData: IncidentCreateRequest = { ...formData };
    
    // Ensure empty strings are not sent for optional UUID fields
    if (submitData.assignee_id === '') submitData.assignee_id = undefined;
    if (submitData.department_id === '') submitData.department_id = undefined;
    if (submitData.location_id === '') submitData.location_id = undefined;
    if (submitData.classification_id === '') submitData.classification_id = undefined;

    const lookupIds = Object.values(lookupValues).filter(Boolean);
    if (lookupIds.length > 0) {
      submitData.lookup_value_ids = lookupIds;
    }

    if (formData.due_date) {
      submitData.due_date = new Date(formData.due_date).toISOString();
    } else {
      submitData.due_date = undefined;
    }

    createMutation.mutate(submitData);
  };
  
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
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">{t('incidents.details')}</h2>
              <div className="grid grid-cols-2 gap-4">
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
                <Select
                  label={t('incidents.source')}
                  value={formData.source || ''}
                  onChange={(e) => handleChange('source', e.target.value as IncidentSource || undefined)}
                  options={sourceOptions}
                  required={workflowRequiredFields.includes('source')}
                  error={errors.source}
                />

                {incidentLookupCategories.map(category => {
                  const lookupFieldKey = `lookup:${category.code}`;
                  const isRequired = workflowRequiredFields.includes(lookupFieldKey as any);
                  return (
                    <Select
                      key={category.id}
                      label={i18n.language === 'ar' ? category.name_ar || category.name : category.name}
                      value={lookupValues[category.id] || ''}
                      onChange={(e) => handleLookupChange(category.id, e.target.value)}
                      options={[
                        { value: '', label: t('common.select') },
                        ...(category.values || []).map(v => ({
                          value: v.id,
                          label: i18n.language === 'ar' && v.name_ar ? v.name_ar : v.name,
                        }))
                      ]}
                      required={isRequired}
                      error={errors[lookupFieldKey]}
                    />
                  );
                })}
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

          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold">{t('incidents.workflow')}</h2>
              </div>
              <Select
                label={t('incidents.workflow')}
                value={formData.workflow_id || ''}
                onChange={(e) => handleChange('workflow_id', e.target.value)}
                error={errors.workflow_id}
                options={workflowOptions}
                required
              />
              {isAutoMatched && autoMatchedWorkflow && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
                  <Info className="w-3 h-3" />
                  <span>{t('incidents.autoMatchedHint')}</span>
                </div>
              )}
            </Card>

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
