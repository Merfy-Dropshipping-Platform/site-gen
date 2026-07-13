/**
 * Public entry point for the theme structural-conformance capability model.
 *
 * Real consumers import the `@merfy/theme-contract/conformance` package subpath;
 * the site-gen service (which does not yet declare this package as a dependency)
 * imports the same modules via the existing source-relative convention until the
 * workspace topology changes in a later task.
 */

export * from './types';
export {
  makeCapabilityId,
  makeEndpointId,
  encodeOpaqueSegment,
  decodeOpaqueSegment,
  sortById,
  aggregateCapabilityStatus,
} from './ids';
export { inventoryFields } from './field-inventory';
export type {
  FieldInventoryInput,
  FieldInventoryBlockInput,
  FieldSource,
  RawPuckField,
} from './field-inventory';
export { inventoryThemeSettings } from './theme-settings-inventory';
export type {
  ThemeSettingsInput,
  ThemeSchemeInput,
} from './theme-settings-inventory';
export {
  overlayRequirements,
  proposeRequirements,
} from './requirements';
export type {
  OverlayResult,
  ReleaseContractInput,
} from './requirements';
export {
  canonicalStringify,
  fingerprintStructuralIssue,
  fingerprintRequirement,
  fingerprintRequirements,
  collectGateFindings,
} from './findings';
export type {
  RequirementFingerprint,
  GateFindingsResult,
} from './findings';
export {
  compareBaseline,
  shrinkBaseline,
  appendRequirementLocks,
} from './ratchet';
export type {
  CompareResult,
  MutationResult,
} from './ratchet';
export {
  redact,
  isEmailLikeValue,
  sortCapabilities,
  sortStructuralIssues,
  sortFindings,
  buildConformanceReport,
} from './report';
export type {
  ConformanceReport,
  ConformanceReportInput,
} from './report';
export {
  serializeInventory,
  digestBytes,
  computeInventoryDigest,
  buildReviewEnvelope,
  computeReviewDigest,
  recomputeReviewDigestFromBaseline,
} from './inventory-artifact';
export type {
  CandidateInventory,
  ReviewEnvelope,
  ReviewEnvelopeInput,
} from './inventory-artifact';
