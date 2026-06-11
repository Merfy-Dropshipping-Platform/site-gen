/**
 * ThemeBuildService — Constructor v2, Phase 1 (Task A1).
 *
 * Builds an arbitrary "верстальщик" (designer) theme as a standalone Astro 5
 * project and copies its produced `dist/` into `dist/theme-preview/<themeName>/`
 * at the sites-repo root. That output is what the constructor preview serves
 * (A2) and what the Docker image COPYs (A3).
 *
 * Each theme is a complete, self-contained Astro project under `themes/<name>`
 * with its OWN package.json / astro.config / node_modules. We therefore ALWAYS
 * build INSIDE the theme directory using its own toolchain — never the sites
 * service's (Astro 4) environment.
 *
 * Scope (YAGNI): build one theme by name + copy to theme-preview. No registry,
 * no watcher, no multi-theme orchestration — those are later tasks.
 */
import { Injectable, Logger } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs/promises";
import { constants as fsConstants } from "fs";
import { runCommand } from "./build.service";

/**
 * URL prefix under which built theme previews are served as static assets
 * (see main.ts `useStaticAssets(dist/theme-preview, { prefix })`). Built pages
 * are rewritten to reference everything under `<prefix>/<theme>/`.
 */
export const THEME_PREVIEW_URL_PREFIX = "/__theme";

/** Result of building a single theme. */
export interface ThemeBuildResult {
  themeName: string;
  /** Absolute path to themes/<name> */
  themeDir: string;
  /** Absolute path to the copied preview output: dist/theme-preview/<name> (prefixed urls) */
  previewDir: string;
  /** Absolute path to the live copy: dist/theme-live/<name> (ROOT urls, no rewrite) */
  liveDir: string;
}

/** Absolute path to the sites-repo root (cwd of the running service). */
function repoRoot(): string {
  return process.cwd();
}

/** Absolute path to a theme's source directory: themes/<name>. */
export function themeDirFor(themeName: string): string {
  return path.join(repoRoot(), "themes", themeName);
}

/** Absolute path to a theme's preview output: dist/theme-preview/<name>. */
export function themePreviewDirFor(themeName: string): string {
  return path.join(repoRoot(), "dist", "theme-preview", themeName);
}

/** Absolute path to a theme's LIVE output: dist/theme-live/<name> (root urls). */
export function themeLiveDirFor(themeName: string): string {
  return path.join(repoRoot(), "dist", "theme-live", themeName);
}

async function isDir(p: string): Promise<boolean> {
  return fs
    .stat(p)
    .then((s) => s.isDirectory())
    .catch(() => false);
}

@Injectable()
export class ThemeBuildService {
  private readonly logger = new Logger("ThemeBuildService");

  /**
   * Build a single theme and copy its dist/ to dist/theme-preview/<themeName>/.
   *
   * Steps:
   *   1. Locate themes/<themeName> (clear error if missing).
   *   2. Install its deps (skipped if node_modules already present) + run its
   *      own `astro build` inside the theme dir (stderr surfaced on failure).
   *   3. Copy themes/<themeName>/dist → dist/theme-preview/<themeName>.
   *
   * @returns paths to the theme dir and the produced preview dir.
   */
  async build(themeName: string): Promise<ThemeBuildResult> {
    if (!themeName || themeName.includes("/") || themeName.includes("..")) {
      throw new Error(`Invalid theme name: "${themeName}"`);
    }

    const themeDir = themeDirFor(themeName);
    const previewDir = themePreviewDirFor(themeName);

    // ── Step 1: locate theme ───────────────────────────────────────────────
    if (!(await isDir(themeDir))) {
      throw new Error(
        `Theme "${themeName}" not found at ${themeDir} (expected a standalone Astro project under themes/)`,
      );
    }

    this.logger.log(`[theme-build] building "${themeName}" at ${themeDir}`);

    // ── Step 2: install deps (if needed) + build with the theme's own toolchain
    await this.installIfNeeded(themeName, themeDir);
    await this.runAstroBuild(themeName, themeDir);

    // ── Step 3: copy theme dist/ → dist/theme-preview/<name> ────────────────
    const themeDist = path.join(themeDir, "dist");
    if (!(await isDir(themeDist))) {
      throw new Error(
        `Theme "${themeName}" build did not produce a dist/ directory at ${themeDist}`,
      );
    }

    // ── Step 3a: докопировать общие ассеты theme-base в дист темы ──────────
    // Astro копирует в dist только public/ САМОЙ темы. Блоки, рендерящиеся
    // theme-base-фоллбеком (compile-astro-blocks → Container API), ссылаются
    // на /placeholders/*.png из packages/theme-base/public — без докопирования
    // эти пути 404 и в превью, и на live (битые постеры Video/Gallery/
    // Publications). Делается ДО copyDir в превью (step 3b) и live (step 4b),
    // чтобы ассеты попали в обе копии. Файлы темы важнее: существующие пути
    // НЕ перезаписываются (skip-existing).
    const themeBasePublic = path.join(
      repoRoot(),
      "packages",
      "theme-base",
      "public",
    );
    await mergeCopyDirSkipExisting(themeBasePublic, themeDist);
    this.logger.log(
      `[theme-build] "${themeName}" merged theme-base public assets into dist (skip-existing)`,
    );

    await copyDir(themeDist, previewDir);

    // ── Step 4: rewrite root-absolute URLs so the page renders under a per-theme
    // subpath (/__theme/<name>/) instead of the origin root. The верстальщик's
    // output references assets/links absolutely (`/_astro/…`, `/images/…`,
    // `/fonts/…` in markup AND `url(/fonts/…)` inside bundled CSS); served as-is
    // under the constructor origin those would 404.
    await rewriteAbsoluteUrls(previewDir, themeName);

    // ── Step 4b: LIVE copy — verbatim root-url dist for the live publish
    // pipeline. NO rewrite (themes build with base '/'), so urls stay rooted.
    // Ships in the runtime image via the existing `COPY /app/dist`.
    const liveDir = themeLiveDirFor(themeName);
    await copyDir(themeDist, liveDir);
    this.logger.log(`[theme-build] "${themeName}" → ${liveDir} (live root-url copy)`);

    this.logger.log(
      `[theme-build] "${themeName}" → ${previewDir} (copied from ${themeDist}, urls rewritten under ${THEME_PREVIEW_URL_PREFIX}/${themeName})`,
    );

    return { themeName, themeDir, previewDir, liveDir };
  }

  /**
   * Install the theme's dependencies with pnpm if node_modules is absent.
   * Themes declare `packageManager: pnpm@...` and pnpm-specific config, so we
   * use pnpm. NODE_AUTH_TOKEN is forwarded so the private GitHub Packages
   * design-system dep can resolve.
   */
  private async installIfNeeded(
    themeName: string,
    themeDir: string,
  ): Promise<void> {
    const nodeModules = path.join(themeDir, "node_modules");
    if (await isDir(nodeModules)) {
      this.logger.log(
        `[theme-build] "${themeName}" node_modules present — skipping install`,
      );
      return;
    }

    const authToken = process.env.NODE_AUTH_TOKEN ?? "";
    if (!authToken) {
      this.logger.warn(
        `[theme-build] NODE_AUTH_TOKEN is empty — install may fail on private @merfy-dropshipping-platform deps`,
      );
    }

    // --ignore-workspace: the theme is a standalone Astro 5 project and must NOT
    // join the monorepo pnpm workspace (which carries Astro 4 / lacks theme deps,
    // leaving node_modules empty). Verified required — the .npmrc key alone does
    // not isolate when a parent pnpm-workspace.yaml exists.
    this.logger.log(`[theme-build] "${themeName}" pnpm install ...`);
    const install = await runCommand(
      "pnpm",
      ["install", "--ignore-workspace", "--prefer-offline"],
      themeDir,
      300_000,
      { NODE_AUTH_TOKEN: authToken },
    );
    if (install.code !== 0) {
      throw new Error(
        `pnpm install failed for theme "${themeName}" (exit ${install.code}):\n${install.stderr}`,
      );
    }
    this.logger.log(`[theme-build] "${themeName}" pnpm install completed`);
  }

  /**
   * Run the theme's own `astro build` inside its directory.
   *
   * We invoke astro directly via `pnpm exec` rather than `pnpm build` so the
   * theme's package `prebuild`/lifecycle hooks (e.g. image optimisation that may
   * reference scripts not shipped here) do not block the static build. We never
   * touch the theme's markup/styling — astro produces the verbatim output.
   */
  private async runAstroBuild(
    themeName: string,
    themeDir: string,
  ): Promise<void> {
    this.logger.log(`[theme-build] "${themeName}" astro build ...`);
    const build = await runCommand(
      "pnpm",
      ["exec", "astro", "build"],
      themeDir,
      300_000,
      { NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? "" },
    );
    if (build.code !== 0) {
      throw new Error(
        `astro build failed for theme "${themeName}" (exit ${build.code}):\n${build.stderr}`,
      );
    }
    this.logger.log(`[theme-build] "${themeName}" astro build completed`);
  }
}

/**
 * Recursively copy a directory tree. Destination is recreated from scratch so a
 * rebuild never serves stale files from a previous build.
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

/**
 * Рекурсивный merge-copy БЕЗ перезаписи: существующие файлы в `dest`
 * сохраняются (файлы темы важнее общих), копируются только отсутствующие
 * пути; директории сливаются. No-op, если `src` не существует — сборка темы
 * не должна падать из-за отсутствия общих ассетов.
 */
export async function mergeCopyDirSkipExisting(
  src: string,
  dest: string,
): Promise<void> {
  if (!(await isDir(src))) return;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (e) => {
      const from = path.join(src, e.name);
      const to = path.join(dest, e.name);
      if (e.isDirectory()) return mergeCopyDirSkipExisting(from, to);
      try {
        // COPYFILE_EXCL: атомарный skip-existing — EEXIST означает, что у темы
        // уже есть свой файл по этому пути, и он остаётся нетронутым.
        await fs.copyFile(from, to, fsConstants.COPYFILE_EXCL);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
    }),
  );
}

/**
 * Rewrite root-absolute URLs in built `.html`/`.css` files to a per-theme
 * subpath, so a page authored for the origin root renders correctly when served
 * under `/__theme/<theme>/`. Rewrites assets, fonts (incl. CSS `@font-face`),
 * images and sub-page links uniformly.
 *
 * Only delimiter-led `/` (after `"`, `'`, `(`, `,` or whitespace) that is NOT
 * `//` is rewritten — so protocol-relative (`//cdn`) and absolute `http(s)://`
 * URLs are left untouched. `.js` is never rewritten (output stays verbatim);
 * client-side absolute fetches are out of scope for the read-only Phase 1 preview.
 */
export async function rewriteAbsoluteUrls(
  previewDir: string,
  themeName: string,
): Promise<void> {
  const replacement = `$1${THEME_PREVIEW_URL_PREFIX}/${themeName}/`;
  await rewriteTree(previewDir, ROOT_URL_RE, replacement);
}

/**
 * Корневые URL (`"/x"`, `'/x'`, `(/x`, `, /x`) — ЕДИНЫЙ паттерн для шелла
 * (rewriteAbsoluteUrls при сборке темы) и для блоков (composeV2Page при
 * пересадке). Расхождение паттернов = блоки и шелл переписываются по-разному
 * → 404 на ассеты только внутри пересаженных блоков.
 */
export const ROOT_URL_RE = /(["'(,\s])\/(?!\/)/g;

/** Переписать корневые URL HTML-фрагмента под префикс, тела <script> verbatim. */
export function rewriteRootUrlsToPrefix(html: string, prefix: string): string {
  return rewriteHtmlPreservingScripts(html, ROOT_URL_RE, `$1${prefix}/`);
}

/**
 * Переписывает root-relative URL в HTML, НО оставляет тела <script> нетронутыми —
 * переписать JS = сломать regex-литералы/пути → runtime-ошибки (вся интерактивность
 * превью падает). Открывающий тег <script src="/..."> переписывается (атрибут src),
 * тело скрипта — verbatim.
 */
export function rewriteHtmlPreservingScripts(
  content: string,
  re: RegExp,
  replacement: string,
): string {
  let result = "";
  let last = 0;
  const scriptRe = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(content)) !== null) {
    result += content.slice(last, m.index).replace(re, replacement);
    const block = m[0];
    const openEnd = block.indexOf(">") + 1;
    // Только открывающий тег (src=…) переписываем; JS-тело + </script> — verbatim.
    result += block.slice(0, openEnd).replace(re, replacement) + block.slice(openEnd);
    last = m.index + block.length;
  }
  result += content.slice(last).replace(re, replacement);
  return result;
}

async function rewriteTree(
  dir: string,
  re: RegExp,
  replacement: string,
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return rewriteTree(full, re, replacement);
      if (!/\.(html|css)$/i.test(e.name)) return;
      const content = await fs.readFile(full, "utf-8");
      // HTML: переписываем разметку/атрибуты, но НЕ тела <script> — иначе regex-литералы
      // и пути внутри inline-скриптов корраптятся (`(/[&<>"']/g` → `(/__theme/rose/[&<>"']/g`
      // → "Invalid regular expression flags" + "__theme is not defined") и ВЕСЬ interactive
      // JS превью падает (checkout DaData/варианты не инициализируются). CSS — как есть.
      const next = /\.html$/i.test(e.name)
        ? rewriteHtmlPreservingScripts(content, re, replacement)
        : content.replace(re, replacement);
      if (next !== content) await fs.writeFile(full, next, "utf-8");
    }),
  );
}
