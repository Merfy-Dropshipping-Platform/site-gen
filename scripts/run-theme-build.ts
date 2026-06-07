/**
 * Throwaway runner for Task A1 verification: builds a theme via ThemeBuildService.
 * Usage: NODE_AUTH_TOKEN=$(gh auth token) npx tsx scripts/run-theme-build.ts rose
 */
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
