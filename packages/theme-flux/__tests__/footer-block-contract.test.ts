import fs from "node:fs";
import path from "node:path";
import {
  resolveBlocks,
  type BaseBlockEntry,
} from "../../theme-contract/resolver/resolveBlocks";

/**
 * Task 9 (111-flux-layout-parity, Step 2): replaces the stale
 * `footer-block-contract.test.ts`, which imported from
 * `../blocks/Footer` — a directory that does not exist anywhere in this
 * package (confirmed: `packages/theme-flux/blocks/` only ever contained
 * `Catalog/` and `Header/`, never `Footer/`). The old test could never have
 * passed; it was dead from a prior, abandoned Footer-override plan.
 *
 * Flux's Footer already resolves its Puck config from @merfy/theme-base
 * (no override declared, mirroring Header after this task's cleanup — see
 * `header-block-contract.test.ts`). Flux's actual visual Footer renderer
 * lives at `themes/flux/src/components/Footer.astro`, wired independently
 * via `themes/flux/sections.map.json` — covered by
 * `scripts/__tests__/flux-home-contract.test.mjs`, not here.
 */
describe("Flux Footer (no package override)", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "theme.json"), "utf-8"),
  );

  const BASE_BLOCKS: Record<string, BaseBlockEntry> = {
    Footer: { source: "base", path: "@merfy/theme-base/blocks/Footer" },
  };

  it("Footer Puck config resolves from @merfy/theme-base, not a Flux package override", () => {
    const resolved = resolveBlocks(BASE_BLOCKS, {
      blocks: manifest.blocks ?? {},
      features: manifest.features ?? {},
      customBlocks: manifest.customBlocks ?? {},
    });
    expect(resolved.Footer.source).toBe("base");
    expect(resolved.Footer.path).toBe("@merfy/theme-base/blocks/Footer");
  });

  it("theme.json declares no blocks.Footer.override", () => {
    expect(manifest.blocks.Footer?.override).toBeUndefined();
  });

  it("packages/theme-flux/blocks/Footer does not exist on disk", () => {
    expect(
      fs.existsSync(path.resolve(__dirname, "..", "blocks", "Footer")),
    ).toBe(false);
  });

  it("Flux blockDefaults.Footer layers Flux-specific defaults on top of theme-base (3-col variant + newsletter copy + nav links)", () => {
    const footerDefaults = manifest.blockDefaults?.Footer;
    expect(footerDefaults).toBeDefined();
    expect(footerDefaults.variant).toBe("3-col");
    expect(footerDefaults.newsletter?.enabled).toBe(true);
    expect(Array.isArray(footerDefaults.navigationColumn?.links)).toBe(true);
    expect(footerDefaults.navigationColumn.links.length).toBeGreaterThan(0);
  });
});
