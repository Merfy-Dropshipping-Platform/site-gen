/**
 * pnpm-invocation — Task 0 (reproducible package topology).
 *
 * Pure resolution of HOW to spawn pnpm, decoupled from the child-process call
 * itself so it is trivially unit-testable and cannot shell-concatenate a
 * command string or accept a free-form executable from the environment.
 *
 * Background (FACTS F-048): `ThemeBuildService` spawns pnpm to build standalone
 * themes. It historically used a BARE `pnpm`, which on the target machine can
 * resolve an incompatible GLOBAL pnpm 7/9 even when the parent process was
 * launched through pinned `corepack pnpm exec` — because `npm_execpath` is not
 * reliably exposed inside a `corepack pnpm exec` context. We therefore make the
 * invocation an explicit, closed decision:
 *
 *   MERFY_PNPM_MODE=corepack → command `corepack` + argument prefix `["pnpm"]`
 *                              (diagnostic `scripts/run-theme-build.ts` opts in
 *                              so it runs the SAME pinned pnpm as the gate)
 *   unset / empty            → bare `pnpm` fallback for the production runtime
 *                              image, where the Dockerfile explicitly installs
 *                              pnpm@10.14.0 on PATH (and `build-all-themes`)
 *   anything else            → hard reject (no free-form executable from env)
 *
 * The resolved invocation is used for BOTH the standalone `pnpm install` and
 * the `pnpm exec astro build`, so both go through the same pinned binary.
 */

/** How to spawn pnpm: an executable plus an argument prefix. */
export interface PnpmInvocation {
  /** The executable to spawn (never a shell string). */
  command: string;
  /**
   * Arguments that must precede the pnpm subcommand. Empty for the bare
   * `pnpm` fallback; `["pnpm"]` when the command is `corepack`.
   */
  argsPrefix: string[];
}

/**
 * The exact argument list ThemeBuildService passes to install a standalone
 * theme's dependencies. `--ignore-workspace` keeps the theme OUT of the
 * monorepo pnpm workspace (it is a self-contained Astro 5 project);
 * `--prefer-offline` reuses the store when possible. Preserved verbatim from
 * the pre-Task-0 behaviour.
 */
export const PNPM_INSTALL_ARGS: readonly string[] = [
  'install',
  '--ignore-workspace',
  '--prefer-offline',
];

/**
 * The exact argument list ThemeBuildService passes to build a theme. We invoke
 * astro directly via `exec` (not `pnpm build`) so the theme's package lifecycle
 * hooks do not block the static build. Preserved verbatim.
 */
export const PNPM_ASTRO_BUILD_ARGS: readonly string[] = [
  'exec',
  'astro',
  'build',
];

/** Environment variable that opts in to the explicit Corepack invocation. */
export const MERFY_PNPM_MODE_ENV = 'MERFY_PNPM_MODE';

/**
 * Resolve how to spawn pnpm from the given environment.
 *
 * @throws if `MERFY_PNPM_MODE` is set to any value other than `corepack`
 *   (case-sensitive). Empty string is treated as unset.
 */
export function resolvePnpmInvocation(
  env: NodeJS.ProcessEnv = process.env,
): PnpmInvocation {
  const mode = env[MERFY_PNPM_MODE_ENV];

  if (mode === undefined || mode === '') {
    // Bare fallback: production Docker image (and build-all-themes) put the
    // pinned pnpm@10.14.0 on PATH, so a bare `pnpm` is correct and cheap.
    return { command: 'pnpm', argsPrefix: [] };
  }

  if (mode === 'corepack') {
    // Fresh array every call so callers may splice their subcommand onto it.
    return { command: 'corepack', argsPrefix: ['pnpm'] };
  }

  throw new Error(
    `Invalid ${MERFY_PNPM_MODE_ENV}="${mode}": only "corepack" (explicit) or unset (bare pnpm fallback) are supported`,
  );
}
