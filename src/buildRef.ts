/** Injected at CI build time via VITE_BUILD_REF (e.g. pr#6). */
export const BUILD_REF = import.meta.env.VITE_BUILD_REF?.trim() ?? '';

export function versionLabel(pkgVersion: string): string {
  const base = `v${pkgVersion}`;
  return BUILD_REF ? `${base} ${BUILD_REF}` : base;
}
