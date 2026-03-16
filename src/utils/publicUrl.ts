/**
 * Returns the correct URL for a file in the public/ directory,
 * respecting the deployment base path (BASE_PATH from runtime config
 * or Vite's BASE_URL from build time).
 *
 * Usage: publicUrl('epm-logo.png')  →  '/ax3/epm-logo.png'
 */
export function publicUrl(filePath: string): string {
  const base = (
    window.APP_CONFIG?.BASE_PATH ??
    import.meta.env.BASE_URL ??
    "/"
  ).replace(/\/$/, "");
  const p = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return `${base}${p}`;
}
