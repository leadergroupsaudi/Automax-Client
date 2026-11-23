import { useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import {
  EO_MODULE_CODE,
  PERMISSIONS,
  eoTypePermissionCode,
} from "../constants/permissions";
import type { EoTypeAction } from "../constants/permissions";

export const usePermissions = () => {
  const { user } = useAuthStore();

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (user.is_super_admin) return true;
      if (!user.permissions) return false;
      return (
        user.permissions.includes(permission) || user.permissions.includes("*")
      );
    },
    [user],
  );

  const hasAnyPermission = useCallback(
    (permissions: string[]): boolean => {
      if (!user) return false;
      if (user.is_super_admin) return true;
      if (!permissions || permissions.length === 0) return true; // No permissions required
      return permissions.some((perm) => hasPermission(perm));
    },
    [user, hasPermission],
  );

  const hasAllPermissions = useCallback(
    (permissions: string[]): boolean => {
      if (!user) return false;
      if (user.is_super_admin) return true;
      if (!permissions || permissions.length === 0) return true; // No permissions required
      return permissions.every((perm) => hasPermission(perm));
    },
    [user, hasPermission],
  );

  const hasRole = useCallback(
    (roleCode: string): boolean => {
      if (!user) return false;
      if (user.is_super_admin) return true;
      if (!user.roles) return false;
      return user.roles.some(
        (role) => role.code === roleCode && role.is_active,
      );
    },
    [user],
  );

  /**
   * Executive Office, §7.11: may this caller run `action` on the record type
   * `typeKey`?
   *
   * THE SERVER'S ALGEBRA, REPRODUCED EXACTLY — the module code AND the
   * per-type code. See the EO block in constants/permissions.ts for why it is
   * AND and not OR, and why `transition` asks the type's UPDATE code.
   *
   * A super admin passes, as they do in middleware.EOTypePermission and in
   * repository.applyEORecordTypePermissions.
   *
   * An ABSENT typeKey is false for everybody but a super admin: a per-type
   * check with no type has not made a decision, and answering true would be
   * the OR bug in a different costume. Callers that legitimately have no type
   * in hand (the all-types register's New button) must resolve one first.
   */
  const canEoRecordType = useCallback(
    (typeKey: string | null | undefined, action: EoTypeAction): boolean => {
      if (user?.is_super_admin) return true;
      if (!typeKey) return false;
      return (
        hasPermission(EO_MODULE_CODE[action]) &&
        hasPermission(eoTypePermissionCode(typeKey, action))
      );
    },
    [user, hasPermission],
  );

  return {
    // Core permission functions
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,

    // User state
    isSuperAdmin: user?.is_super_admin ?? false,
    isAuthenticated: !!user,

    // User management permissions
    canViewUsers: () => hasPermission(PERMISSIONS.USERS_VIEW),
    canCreateUsers: () => hasPermission(PERMISSIONS.USERS_CREATE),
    canUpdateUsers: () => hasPermission(PERMISSIONS.USERS_UPDATE),
    canDeleteUsers: () => hasPermission(PERMISSIONS.USERS_DELETE),

    // Role management permissions
    canViewRoles: () => hasPermission(PERMISSIONS.ROLES_VIEW),
    canCreateRoles: () => hasPermission(PERMISSIONS.ROLES_CREATE),
    canUpdateRoles: () => hasPermission(PERMISSIONS.ROLES_UPDATE),
    canDeleteRoles: () => hasPermission(PERMISSIONS.ROLES_DELETE),

    // Permission management permissions
    canViewPermissions: () => hasPermission(PERMISSIONS.PERMISSIONS_VIEW),
    canCreatePermissions: () => hasPermission(PERMISSIONS.PERMISSIONS_CREATE),
    canUpdatePermissions: () => hasPermission(PERMISSIONS.PERMISSIONS_UPDATE),
    canDeletePermissions: () => hasPermission(PERMISSIONS.PERMISSIONS_DELETE),

    // Department permissions
    canViewDepartments: () => hasPermission(PERMISSIONS.DEPARTMENTS_VIEW),
    canCreateDepartments: () => hasPermission(PERMISSIONS.DEPARTMENTS_CREATE),
    canUpdateDepartments: () => hasPermission(PERMISSIONS.DEPARTMENTS_UPDATE),
    canDeleteDepartments: () => hasPermission(PERMISSIONS.DEPARTMENTS_DELETE),

    // Location permissions
    canViewLocations: () => hasPermission(PERMISSIONS.LOCATIONS_VIEW),
    canCreateLocations: () => hasPermission(PERMISSIONS.LOCATIONS_CREATE),
    canUpdateLocations: () => hasPermission(PERMISSIONS.LOCATIONS_UPDATE),
    canDeleteLocations: () => hasPermission(PERMISSIONS.LOCATIONS_DELETE),

    // Classification permissions
    canViewClassifications: () =>
      hasPermission(PERMISSIONS.CLASSIFICATIONS_VIEW),
    canCreateClassifications: () =>
      hasPermission(PERMISSIONS.CLASSIFICATIONS_CREATE),
    canUpdateClassifications: () =>
      hasPermission(PERMISSIONS.CLASSIFICATIONS_UPDATE),
    canDeleteClassifications: () =>
      hasPermission(PERMISSIONS.CLASSIFICATIONS_DELETE),

    // Workflow permissions
    canViewWorkflows: () => hasPermission(PERMISSIONS.WORKFLOWS_VIEW),
    canCreateWorkflows: () => hasPermission(PERMISSIONS.WORKFLOWS_CREATE),
    canUpdateWorkflows: () => hasPermission(PERMISSIONS.WORKFLOWS_UPDATE),
    canDeleteWorkflows: () => hasPermission(PERMISSIONS.WORKFLOWS_DELETE),

    // Incident permissions
    canViewIncidents: () => hasPermission(PERMISSIONS.INCIDENTS_VIEW),
    canViewAllIncidents: () =>
      hasPermission(PERMISSIONS.INCIDENTS_VIEW_ALL) ||
      hasPermission(PERMISSIONS.INCIDENTS_VIEW_DEPARTMENT_ONLY),
    canCreateIncidents: () => hasPermission(PERMISSIONS.INCIDENTS_CREATE),
    canUpdateIncidents: () => hasPermission(PERMISSIONS.INCIDENTS_UPDATE),
    canDeleteIncidents: () => hasPermission(PERMISSIONS.INCIDENTS_DELETE),
    canTransitionIncidents: () =>
      hasPermission(PERMISSIONS.INCIDENTS_TRANSITION),
    canAssignIncidents: () => hasPermission(PERMISSIONS.INCIDENTS_ASSIGN),
    canCommentIncidents: () => hasPermission(PERMISSIONS.INCIDENTS_COMMENT),

    // Request permissions
    canViewRequests: () => hasPermission(PERMISSIONS.REQUESTS_VIEW),
    canViewAllRequests: () => hasPermission(PERMISSIONS.REQUESTS_VIEW_ALL),
    canCreateRequests: () => hasPermission(PERMISSIONS.REQUESTS_CREATE),
    canUpdateRequests: () => hasPermission(PERMISSIONS.REQUESTS_UPDATE),
    canDeleteRequests: () => hasPermission(PERMISSIONS.REQUESTS_DELETE),
    canTransitionRequests: () => hasPermission(PERMISSIONS.REQUESTS_TRANSITION),
    canAssignRequests: () => hasPermission(PERMISSIONS.REQUESTS_ASSIGN),
    canCommentRequests: () => hasPermission(PERMISSIONS.REQUESTS_COMMENT),

    // Complaint permissions
    canViewComplaints: () => hasPermission(PERMISSIONS.COMPLAINTS_VIEW),
    canViewAllComplaints: () => hasPermission(PERMISSIONS.COMPLAINTS_VIEW_ALL),
    canCreateComplaints: () => hasPermission(PERMISSIONS.COMPLAINTS_CREATE),
    canUpdateComplaints: () => hasPermission(PERMISSIONS.COMPLAINTS_UPDATE),
    canDeleteComplaints: () => hasPermission(PERMISSIONS.COMPLAINTS_DELETE),
    canTransitionComplaints: () =>
      hasPermission(PERMISSIONS.COMPLAINTS_TRANSITION),
    canAssignComplaints: () => hasPermission(PERMISSIONS.COMPLAINTS_ASSIGN),
    canCommentComplaints: () => hasPermission(PERMISSIONS.COMPLAINTS_COMMENT),

    // Query permissions
    canViewQueries: () => hasPermission(PERMISSIONS.QUERIES_VIEW),
    canViewAllQueries: () => hasPermission(PERMISSIONS.QUERIES_VIEW_ALL),
    canCreateQueries: () => hasPermission(PERMISSIONS.QUERIES_CREATE),
    canUpdateQueries: () => hasPermission(PERMISSIONS.QUERIES_UPDATE),
    canDeleteQueries: () => hasPermission(PERMISSIONS.QUERIES_DELETE),
    canTransitionQueries: () => hasPermission(PERMISSIONS.QUERIES_TRANSITION),
    canAssignQueries: () => hasPermission(PERMISSIONS.QUERIES_ASSIGN),
    canCommentQueries: () => hasPermission(PERMISSIONS.QUERIES_COMMENT),

    // Report permissions
    canViewReports: () => hasPermission(PERMISSIONS.REPORTS_VIEW),
    canCreateReports: () => hasPermission(PERMISSIONS.REPORTS_CREATE),
    canUpdateReports: () => hasPermission(PERMISSIONS.REPORTS_UPDATE),
    canDeleteReports: () => hasPermission(PERMISSIONS.REPORTS_DELETE),

    // Action log permissions
    canViewActionLogs: () => hasPermission(PERMISSIONS.ACTION_LOGS_VIEW),
    canDeleteActionLogs: () => hasPermission(PERMISSIONS.ACTION_LOGS_DELETE),

    // Lookup permissions
    canViewLookups: () => hasPermission(PERMISSIONS.LOOKUPS_VIEW),
    canCreateLookups: () => hasPermission(PERMISSIONS.LOOKUPS_CREATE),
    canUpdateLookups: () => hasPermission(PERMISSIONS.LOOKUPS_UPDATE),
    canDeleteLookups: () => hasPermission(PERMISSIONS.LOOKUPS_DELETE),

    // Goal/KPI master data (pillars, enablers, goals, objectives, criteria...)
    canManageGoalHierarchy: () => hasPermission(PERMISSIONS.GOALS_MANAGE),

    // KPI dictionary permissions
    canViewKpi: () => hasPermission(PERMISSIONS.KPI_VIEW),
    canCreateKpi: () => hasPermission(PERMISSIONS.KPI_CREATE),
    canUpdateKpi: () => hasPermission(PERMISSIONS.KPI_UPDATE),
    canDeleteKpi: () => hasPermission(PERMISSIONS.KPI_DELETE),
    canApproveKpi: () => hasPermission(PERMISSIONS.KPI_APPROVE),
    canAssignKpi: () => hasPermission(PERMISSIONS.KPI_ASSIGN),

    // KPI performance permissions
    canViewKpiPerformance: () => hasPermission(PERMISSIONS.PERF_VIEW),
    canSubmitKpiPerformance: () => hasPermission(PERMISSIONS.PERF_SUBMIT),
    canReviewKpiPerformance: () => hasPermission(PERMISSIONS.PERF_REVIEW),
    canOverrideKpiApprovalLock: () =>
      hasPermission(PERMISSIONS.PERF_OVERRIDE_LOCK),

    // KPI target permissions
    canViewKpiTargets: () => hasPermission(PERMISSIONS.TARGETS_VIEW),
    canSetKpiTargets: () => hasPermission(PERMISSIONS.TARGETS_SET),

    // KPI benchmark / segmentation permissions
    canManageKpiBenchmarks: () => hasPermission(PERMISSIONS.BENCHMARK_MANAGE),
    canManageKpiSegments: () => hasPermission(PERMISSIONS.SEGMENT_MANAGE),
    canManageCorrectiveActions: () =>
      hasPermission(PERMISSIONS.CORRECTIVE_ACTION_MANAGE),

    // Executive Office — module code AND per-type code. Every EO gate goes
    // through this one function; nothing rebuilds `eo:<key>:<action>` itself.
    canEoRecordType,
  };
};

export default usePermissions;
