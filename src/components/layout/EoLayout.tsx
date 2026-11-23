import React, { useState, useRef, useEffect, useMemo } from "react";
import { BrandLogo } from "@/components/common/BrandLogo";
import { Outlet, NavLink, Navigate, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  LogOut,
  Home,
  Menu,
  X,
  ChevronDown,
  Sparkles,
  Briefcase,
  UserCircle,
  Languages,
  Layers,
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { authApi } from "../../api/auth";
import { setLoggingOut } from "../../api/client";
import {
  setLanguage,
  getCurrentLanguage,
  supportedLanguages,
} from "../../i18n";
import { usePermissions } from "../../hooks/usePermissions";
import { useLicense, useLicenseInfo } from "../../hooks/useLicense";
import { useEoRecordTypes } from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { PERMISSIONS } from "../../constants/permissions";
import ThemeToggle from "../common/ThemeToggle";
import { NotificationBell } from "../common/NotificationBell";

/**
 * Shell for the Executive Office module, modelled on GoalLayout.
 *
 * It also carries the module's LICENCE guard. There is no license-aware route
 * component in this app — isFeatureLicensed is consulted only by DashboardPage
 * and AdminLayout — so without the check below a user holding `eo:view` but no
 * `eo_platform` licence could deep-link to /eo and sit in front of a shell
 * whose every API call 403s. The check waits for `hasLicense` so it cannot
 * bounce a legitimate user during the licence store's first load.
 */
export const EoLayout: React.FC = () => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const langRef = useRef<HTMLDivElement>(null);
  const { hasPermission, isSuperAdmin } = usePermissions();
  // AdminProtectedRoute does NOT bootstrap the licence store — only
  // ProtectedRoute does, and that wraps /dashboard, /profile and /settings
  // alone. A deep link straight to /eo would therefore reach the guard below
  // with hasLicense === false forever, and the guard would never fire. Fetch
  // it here; react-query dedupes against the dashboard's own call.
  useLicenseInfo();
  const { isFeatureLicensed, hasLicense } = useLicense();
  const localize = useLocalizedField();

  const typesQuery = useEoRecordTypes();
  const navTypes = useMemo(
    () =>
      (typesQuery.data?.data ?? [])
        .filter((rt) => !rt.is_abstract && rt.is_active)
        .filter(
          (rt) =>
            isSuperAdmin ||
            hasPermission(`eo:${rt.key}:view`) ||
            hasPermission(PERMISSIONS.EO_VIEW),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [typesQuery.data, isSuperAdmin, hasPermission],
  );

  const handleLanguageChange = async (langCode: string) => {
    if (langCode === currentLang) {
      setIsLangOpen(false);
      return;
    }
    await setLanguage(langCode);
    setCurrentLang(langCode);
    setIsLangOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    logout();
    try {
      await authApi.logout();
    } catch {
      // Continue with logout even if the API call fails.
    } finally {
      setLoggingOut(false);
    }
    navigate("/login");
  };

  const navLinkClass = (isActive: boolean) =>
    `group relative flex items-center ${collapsed ? "justify-center" : ""} px-3 py-2.5 rounded-xl transition-all duration-200 ${
      isActive
        ? "bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-blue-500/20"
        : "text-slate-400 hover:text-white hover:bg-white/5"
    }`;

  const navItem = (
    to: string,
    label: string,
    Icon: React.ElementType,
    end = false,
  ) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setMobileMenuOpen(false)}
      className={({ isActive }) => navLinkClass(isActive)}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-e-full" />
          )}
          <Icon size={20} className="flex-shrink-0" />
          {!collapsed && (
            <span className="ms-3 font-medium text-sm truncate">{label}</span>
          )}
        </>
      )}
    </NavLink>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div
        className={`h-[70px] flex items-center ${collapsed ? "justify-center px-2" : "px-5"} border-b border-white/5`}
      >
        <BrandLogo className={collapsed ? "h-8 w-auto" : "h-10 w-auto"} />
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`hidden lg:flex absolute top-[75px] ${collapsed ? "start-[60px]" : "start-[248px]"} z-50 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-lg`}
      >
        <ChevronLeft
          className={`w-3.5 h-3.5 transition-transform ${collapsed ? "rotate-180 rtl:rotate-180" : "rtl:-rotate-180"}`}
        />
      </button>

      <nav className="flex-1 py-6 px-3 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 mb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {t("eo.nav.section", "Executive Office")}
          </p>
        )}
        <div className="space-y-1">
          {navItem(
            "/eo/my-assigned",
            t("eo.nav.myAssigned", "My assigned"),
            UserCircle,
          )}
          {navItem(
            "/eo/records",
            t("eo.nav.allRecords", "All records"),
            Layers,
            true,
          )}
        </div>

        {navTypes.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-3 mt-6 mb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {t("eo.nav.recordTypes", "Registers")}
              </p>
            )}
            <div className="space-y-1 mt-2">
              {navTypes.map((rt) =>
                navItem(
                  `/eo/${rt.key}`,
                  localize(rt as unknown as Record<string, unknown>, "name") ||
                    rt.name,
                  Briefcase,
                  true,
                ),
              )}
            </div>
          </>
        )}
      </nav>
    </div>
  );

  // Licence guard — see the component doc comment.
  if (hasLicense && !isSuperAdmin && !isFeatureLicensed("eo_platform")) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={`${collapsed ? "w-[72px]" : "w-[264px]"} bg-sidebar transition-all duration-300 flex-col hidden lg:flex relative overflow-y-auto`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 start-0 w-[264px] bg-slate-900 z-50 transform transition-transform duration-300 lg:hidden overflow-y-auto ${mobileMenuOpen ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"}`}
      >
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 end-4 p-2 text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-[70px] bg-white dark:bg-sidebar border-b border-slate-200/80 dark:border-white/5 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl lg:hidden transition-colors"
            >
              <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
            <Link
              to="/eo/records"
              className="hidden sm:flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              <Briefcase className="w-4 h-4" />
              {t("eo.nav.section", "Executive Office")}
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setIsLangOpen(!isLangOpen)}
                className="flex items-center gap-1.5 p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
              >
                <Languages className="w-5 h-5" />
                <span className="text-xs font-medium uppercase">
                  {currentLang}
                </span>
              </button>
              {isLangOpen && (
                <div className="absolute ltr:right-0 rtl:left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                        currentLang === lang.code
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                      }`}
                    >
                      <div className="text-start">
                        <p className="font-medium">{lang.nativeName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {lang.name}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <NotificationBell />
            <ThemeToggle />

            <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-muted" />

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-3 p-1.5 pe-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer group"
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-9 h-9 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-linear-to-br from-primary to-accent flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {user?.first_name?.[0] || user?.username?.[0] || "U"}
                    </span>
                  </div>
                )}
                <div className="hidden sm:block text-start">
                  <p className="text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">
                    {user?.first_name || user?.username}
                  </p>
                  <p className="text-xs text-slate-400 leading-tight flex items-center gap-1">
                    {user?.is_super_admin && (
                      <Sparkles className="w-3 h-3 text-amber-500" />
                    )}
                    {user?.is_super_admin
                      ? t("profile.superAdmin")
                      : user?.roles?.[0]?.name || t("sidebar.user")}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute ltr:right-0 rtl:left-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {user?.email}
                      </p>
                    </div>
                    <div className="py-2">
                      <NavLink
                        to="/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                      >
                        <Home className="w-4 h-4" />
                        {t("workflows.backToHome")}
                      </NavLink>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        {t("workflows.signOut")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="p-4 lg:p-8">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default EoLayout;
