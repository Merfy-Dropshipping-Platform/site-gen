import { Controller, Get, Query } from "@nestjs/common";
import { RegistryStore } from "../registry/registry.store";

/**
 * GET /api/blocks — exposes block registry.
 *
 * `?palette=true` returns filtered view для constructor frontend
 * (hidden=false, sorted by paletteOrder, минимальные поля).
 * Без query — full registry для admin/debug.
 */
@Controller()
export class BlocksController {
  @Get("/api/blocks")
  getBlocks(@Query("palette") palette?: string) {
    const r = RegistryStore.get();
    if (palette === "true" || palette === "1") {
      return {
        blocks: r.blocks
          .filter((b) => !b.hidden)
          .sort((a, b) => a.paletteOrder - b.paletteOrder)
          .map((b) => ({
            name: b.name,
            label: b.label,
            category: b.category,
            icon: b.icon,
            schema: b.schemaJson,
            defaultProps: b.defaults,
          })),
        version: r.scannedAt,
      };
    }
    return r;
  }
}
