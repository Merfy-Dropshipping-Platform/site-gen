import { resolve } from "node:path";
import { createRequire } from "node:module";
import type { PuckConfigJson } from "../../controllers/theme-puck-config.controller";

// The compiled controller is CommonJS (nest build output). createRequire gives
// a lint-clean CJS `require` for interop from this TS module.
const requireCjs = createRequire(__filename);

/**
 * Load the runtime Puck config for a theme by invoking the COMPILED production
 * controller:
 *
 *   dist/src/controllers/theme-puck-config.controller.js
 *
 * The source controller must NOT be imported under tsx/ts-jest: its `__dirname`
 * would point at the wrong `astro-blocks` location (source tree, not dist), so
 * the block loader's `resolve(__dirname, '..','..','astro-blocks')` would miss
 * the compiled flat modules. The compiled controller's `__dirname` is
 * `dist/src/controllers`, which resolves `dist/astro-blocks` correctly.
 */
export async function loadRuntimePuckConfig(
  themeId: string,
): Promise<PuckConfigJson> {
  const SITES_ROOT = resolve(__dirname, "..", "..", "..");
  const compiledControllerPath = resolve(
    SITES_ROOT,
    "dist",
    "src",
    "controllers",
    "theme-puck-config.controller.js",
  );

  const mod = requireCjs(compiledControllerPath) as {
    ThemePuckConfigController: new () => {
      getPuckConfig(themeId: string): Promise<PuckConfigJson>;
    };
  };
  const controller = new mod.ThemePuckConfigController();
  return controller.getPuckConfig(themeId);
}
