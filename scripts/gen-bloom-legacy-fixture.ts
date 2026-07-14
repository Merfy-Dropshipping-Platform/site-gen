/**
 * One-shot generator for the Bloom legacy golden fixtures (Task 4).
 *
 * Emits `packages/theme-contract/__tests__/fixtures/bloom-legacy-{inventory,baseline}.json`.
 * The pair is a self-consistent legacy TWO-artifact structural baseline: the
 * baseline stores the inventory's SHA-256 and a reviewDigest that recomputes from
 * the stored bytes. It proves Bloom normal/capture/shrink/append/inventory-refresh
 * semantics require NO tier manifest. Run with:
 *
 *   corepack pnpm exec tsx scripts/gen-bloom-legacy-fixture.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  overlayRequirements,
  fingerprintRequirements,
  collectGateFindings,
  serializeInventory,
  computeInventoryDigest,
  buildReviewEnvelope,
  computeReviewDigest,
} from "../packages/theme-contract/conformance";
import type {
  CapabilityRecord,
  RequirementRecord,
  StructuralBaseline,
} from "../packages/theme-contract/conformance";

const GEN = "bloom-legacy-golden-1";

const capabilities: CapabilityRecord[] = [
  {
    id: "bloom.block.Hero.title",
    theme: "bloom",
    surface: "block",
    capability: "Hero.title",
    label: "Hero.title",
    editable: true,
    container: "leaf",
    scenarios: [],
    modes: ["hot-preview", "initial-preview", "live"],
    viewports: ["desktop", "mobile"],
    sources: [],
    status: "PASS",
    failureIds: [],
  },
  {
    id: "bloom.block.Benefits.items",
    theme: "bloom",
    surface: "block",
    capability: "Benefits.items",
    label: "Benefits.items",
    editable: true,
    container: "array",
    scenarios: [],
    modes: ["hot-preview", "initial-preview", "live"],
    viewports: ["desktop", "mobile"],
    sources: [],
    status: "GAP", // one accepted finding to make shrink meaningful
    failureIds: [],
  },
];

const reviewed: RequirementRecord[] = [
  {
    id: "bloom.block.Hero.title",
    sources: [{ kind: "user", ref: "все-должно-быть-открыто" }],
    required: true,
    label: "bloom.block.Hero.title",
    contract: null,
  },
  {
    id: "bloom.block.Benefits.items",
    sources: [{ kind: "user", ref: "все-должно-быть-открыто" }],
    required: true,
    label: "bloom.block.Benefits.items",
    contract: null,
  },
];

const sourceDigest = ("sha256:" + "b".repeat(64)) as `sha256:${string}`;

const overlay = overlayRequirements(capabilities, reviewed);
const reqFps = fingerprintRequirements(reviewed);
const gate = collectGateFindings(overlay.findings, overlay.rows, reqFps);

const inventoryBytes = serializeInventory({
  schemaVersion: 1,
  generatorVersion: GEN,
  theme: "bloom",
  sourceDigest,
  capabilities: overlay.rows,
  structuralIssues: overlay.findings,
  findings: gate.findings,
  requirements: gate.requirements,
});
const inventoryDigest = computeInventoryDigest(inventoryBytes);
const reviewDigest = computeReviewDigest(
  buildReviewEnvelope({
    schemaVersion: 1,
    generatorVersion: GEN,
    theme: "bloom",
    sourceDigest,
    inventoryDigest,
    requirements: gate.requirements,
    findings: gate.findings,
    parentBaselineDigest: null,
  }),
);

const baseline: StructuralBaseline = {
  schemaVersion: 1,
  theme: "bloom",
  reviewDigest,
  inventoryDigest,
  sourceDigest,
  parentBaselineDigest: null,
  requirements: gate.requirements,
  findings: gate.findings,
};

const dir = resolve(
  __dirname,
  "..",
  "packages",
  "theme-contract",
  "__tests__",
  "fixtures",
);
writeFileSync(resolve(dir, "bloom-legacy-inventory.json"), inventoryBytes);
writeFileSync(
  resolve(dir, "bloom-legacy-baseline.json"),
  Buffer.from(JSON.stringify(baseline, null, 2) + "\n", "utf8"),
);

process.stdout.write("bloom legacy golden fixtures written\n");
