/**
 * Throwaway runner for Task A1 verification: builds a theme via ThemeBuildService.
 * Usage: NODE_AUTH_TOKEN=$(gh auth token) npx tsx scripts/run-theme-build.ts rose
 *
 * This diagnostic runs OUTSIDE the production Docker image, where the pinned
 * pnpm@10.14.0 is not guaranteed on PATH. Opt into the explicit Corepack
 * invocation (F-048) BEFORE constructing the service so ThemeBuildService spawns
 * the same pinned pnpm as the release gate rather than a drifting global one.
 * Nest/runtime and build-all-themes keep the bare fallback (Docker installs it).
 */
process.env.MERFY_PNPM_MODE = "corepack";

import { ThemeBuildService } from "../src/generator/theme-build.service";

async function main() {
  const themeName = process.argv[2] ?? "rose";
  const svc = new ThemeBuildService();
  const result = await svc.build(themeName);
  console.log("THEME_BUILD_OK", JSON.stringify(result));
}

main().catch((err) => {
  console.error("THEME_BUILD_FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
