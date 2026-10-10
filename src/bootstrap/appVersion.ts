/* vite.config.ts imports this file through Node's type stripping: no imports, aliases, browser APIs or enums here. */

/** The pipeline's build ID as the last part of package.json's version, as in the Teams package's; "dev" for other builds. */
export function appVersion(packageVersion: string, buildId: string | undefined): string {
  return buildId ? packageVersion.replace(/[^.]*$/, buildId) : 'dev';
}
