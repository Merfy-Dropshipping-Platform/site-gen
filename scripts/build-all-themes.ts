/**
 * Build ALL верстальщик themes under themes/ into dist/theme-preview/<name>/.
 *
 * Runs in the Docker builder (after `nest build`) so the runtime image's
 * dist/theme-preview is populated and the constructor preview (A2) can serve
 * each theme verbatim. Delegates to ThemeBuildService — the single source of
 * truth for install + astro build + copy + URL rewrite. NODE_AUTH_TOKEN must be
 * set in the environment for the private GitHub Packages design-system dep.
 *
 * Usage: tsx scripts/build-all-themes.ts
 * Exits non-zero if ANY theme fails (so a broken theme fails the image build
 * loudly), after attempting every theme and printing a per-theme summary.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { ThemeBuildService } from "../src/generator/theme-build.service";

async function main(): Promise<void> {
  const themesRoot = path.join(process.cwd(), "themes");
  const entries = await fs.readdir(themesRoot, { withFileTypes: true });
  const themes = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (themes.length === 0) {
    console.error("[build-all-themes] no themes found under themes/");
    process.exit(1);
  }

  console.log(
    `[build-all-themes] building ${themes.length} theme(s): ${themes.join(", ")}`,
  );

  const svc = new ThemeBuildService();
  const failures: Array<{ theme: string; error: string }> = [];

  for (const theme of themes) {
    try {
      const result = await svc.build(theme);
      console.log(`[build-all-themes] OK   ${theme} → ${result.previewDir}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[build-all-themes] FAIL ${theme}: ${message}`);
      failures.push({ theme, error: message });
    }
  }

  console.log(
    `[build-all-themes] done: ${themes.length - failures.length}/${themes.length} built`,
  );

  if (failures.length > 0) {
    console.error(
      `[build-all-themes] FAILURES: ${failures.map((f) => f.theme).join(", ")}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[build-all-themes] fatal:", err);
  process.exit(1);
});
