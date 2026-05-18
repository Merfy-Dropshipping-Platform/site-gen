import { Test } from "@nestjs/testing";
import { BlocksController } from "../blocks.controller";
import { RegistryStore } from "../../registry/registry.store";
import type { Registry } from "../../../packages/theme-contract/registry";

const TEST_REG: Registry = {
  blocks: [
    {
      name: "Hero",
      label: "Главный",
      category: "media",
      paletteOrder: 1,
      hidden: false,
      hasAstroRenderer: true,
      hasOverride: [],
      siblings: [],
      schemaJson: {},
      defaults: {},
    },
    {
      name: "Header",
      label: "Шапка",
      category: "chrome",
      paletteOrder: 0,
      hidden: true,
      hasAstroRenderer: true,
      hasOverride: [],
      siblings: [],
      schemaJson: {},
      defaults: {},
    },
    {
      name: "Banner",
      label: "Баннер",
      category: "media",
      paletteOrder: 2,
      hidden: false,
      hasAstroRenderer: true,
      hasOverride: [],
      siblings: [],
      schemaJson: {},
      defaults: {},
    },
  ],
  scannedAt: "2026-05-18T00:00:00Z",
  source: "packages",
};

describe("BlocksController", () => {
  let ctrl: BlocksController;

  beforeAll(async () => {
    RegistryStore.set(TEST_REG);
    const mod = await Test.createTestingModule({ controllers: [BlocksController] }).compile();
    ctrl = mod.get(BlocksController);
  });

  afterAll(() => {
    RegistryStore.reset();
  });

  it("palette=true filters hidden + sorts by paletteOrder", () => {
    const r = ctrl.getBlocks("true");
    expect("blocks" in r ? r.blocks : []).toHaveLength(2);
    const blocks = "blocks" in r ? r.blocks : [];
    expect(blocks[0].name).toBe("Hero"); // paletteOrder 1
    expect(blocks[1].name).toBe("Banner"); // paletteOrder 2
    // Header (hidden) excluded
  });

  it("palette=false returns full registry", () => {
    const r = ctrl.getBlocks(undefined);
    expect("blocks" in r ? r.blocks : []).toHaveLength(3);
  });

  it("palette response has version field", () => {
    const r = ctrl.getBlocks("true");
    expect("version" in r ? r.version : "").toBe("2026-05-18T00:00:00Z");
  });
});
