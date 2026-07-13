/**
 * Site-gen-side conformance snapshot entry point. Later tasks (Bloom release
 * contract, findings, baseline) consume these via the source-relative
 * convention until the workspace topology changes.
 */

export type * from "./source-types";
export { loadThemeSourceSnapshot } from "./source-snapshot";
export { loadRuntimePuckConfig } from "./load-puck-config";

// Task 4 — release contract & structural invariants.
export {
  BLOOM_RELEASE_CONTRACT,
  BLOOM_REQUIRED_RUNTIME_SOURCES,
} from "./bloom-release-contract";
export type {
  BloomReleaseContract,
  RequiredPage,
  RequiredRenderer,
} from "./bloom-release-contract";
export { inventoryStorefrontContracts } from "./storefront-inventory";
export type { StorefrontSourceInput } from "./storefront-inventory";
export {
  runStructuralChecks,
  linkCapabilityFailures,
  findDuplicateCapabilityIssues,
} from "./structural-checks";
export type {
  StructuralCheckSnapshot,
  StructuralCheckPhysicalBlock,
  StructuralCheckResolution,
  StructuralCheckCustomPipeline,
  StructuralCheckFieldRow,
  StructuralCheckSettingRow,
} from "./structural-checks";

// Task 6 — deterministic report, tracked inventory & testable CLI.
export { runThemeConformance, BUILD_ORDER } from "./cli";
export type {
  ConformancePipelineResult,
  ThemeConformanceDeps,
  ThemeConformanceFs,
  ConformanceResult,
} from "./cli";
