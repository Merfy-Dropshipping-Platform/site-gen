/**
 * Site-gen-side conformance snapshot entry point. Later tasks (Bloom release
 * contract, findings, baseline) consume these via the source-relative
 * convention until the workspace topology changes.
 */

export type * from "./source-types";
export { loadThemeSourceSnapshot } from "./source-snapshot";
export { loadRuntimePuckConfig } from "./load-puck-config";

// Task 2 — source-adapter registry (provenance-boundary digest partition).
export {
  THEME_SOURCE_ADAPTERS,
  getThemeSourceAdapter,
} from "./source-adapters";
export {
  BLOOM_SOURCE_ADAPTER,
  SHARED_DIGEST_INPUTS,
} from "./bloom-source-adapter";
export { SATIN_SOURCE_ADAPTER } from "./satin-source-adapter";

// Task 4 — release contract & structural invariants.
export {
  BLOOM_RELEASE_CONTRACT,
  BLOOM_REQUIRED_RUNTIME_SOURCES,
  BLOOM_THEME_RELEASE_CONTRACT,
} from "./bloom-release-contract";
export type {
  BloomReleaseContract,
  RequiredPage,
  RequiredRenderer,
} from "./bloom-release-contract";

// Task 3 — generic release-contract registry (provenance-boundary policy data).
export {
  THEME_RELEASE_CONTRACTS,
  getThemeReleaseContract,
} from "./release-contracts";
export type {
  ThemeReleaseContract,
  ThemeReleaseContractMap,
  ReleasePageRequirement,
  ReleaseFlowRequirement,
} from "./release-contracts";
export { SATIN_RELEASE_CONTRACT } from "./satin-release-contract";
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

// Task 1 — typed theme-adapter registry (path/ACK topology provenance boundary).
export {
  THEME_DESCRIPTORS,
  getThemeDescriptor,
  getThemeBuildPlan,
  resolveRunnableTheme,
} from "./theme-adapters";
export type {
  SupportedConformanceTheme,
  ThemeConformanceAdapter,
  ThemeDescriptorRegistry,
  RunnableThemeBundle,
} from "./theme-adapters";
export { BLOOM_THEME_DESCRIPTOR } from "./theme-descriptors/bloom";
export { SATIN_THEME_DESCRIPTOR } from "./theme-descriptors/satin";
export type {
  LegacyArtifactPaths,
  TieredArtifactPaths,
  ThemeArtifactPaths,
  LegacyMutationAcks,
  TieredMutationAcks,
  ThemeMutationAcks,
  ThemeBuildStep,
} from "./theme-adapter";

// Task 6 — deterministic report, tracked inventory & testable CLI.
export { runThemeConformance, BUILD_ORDER } from "./cli";
export type {
  ConformancePipelineResult,
  ThemeConformanceDeps,
  ThemeConformanceFs,
  ConformanceResult,
} from "./cli";
