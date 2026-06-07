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
import { runCommand } from "./build.service";

/** Result of building a single theme. */
export interface ThemeBuildResult {
  themeName: string;
  /** Absolute path to themes/<name> */
  themeDir: string;
  /** Absolute path to the copied output: dist/theme-preview/<name> */
  previewDir: string;
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
    await copyDir(themeDist, previewDir);

    this.logger.log(
      `[theme-build] "${themeName}" → ${previewDir} (copied from ${themeDist})`,
    );

    return { themeName, themeDir, previewDir };
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
