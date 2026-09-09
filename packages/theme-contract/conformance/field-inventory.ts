/**
 * Recursive Puck field inventory.
 *
 * Walks the union of constructor-facing runtime fields, resolved raw Puck fields
 * and physically discovered raw Puck fields for each block, recursing through
 * objects and arrays. Every leaf/container becomes a {@link CapabilityRecord}
 * with a stable capability ID, source insertion `order`, constraints, resolved
 * `visibleWhen` condition target and a deterministic scenario set. Editable rows
 * start `UNKNOWN`; `hidden`/decorative rows start `PASS`. `caseResults` stays
 * empty — Plan 2 populates one result per scenario × mode × viewport.
 *
 * This module is a GENERIC walker: it imports nothing from the site-gen runtime.
 * The site-gen adapter feeds it plain field-definition trees.
 */

import type {
  CapabilityRecord,
  DefaultReference,
  FieldConstraints,
  FieldPresence,
  PreviewMode,
  ScenarioDefinition,
  ViewportName,
} from './types';
import { makeCapabilityId, sortById } from './ids';

// --- input contract --------------------------------------------------------

/** Loose Puck field definition (same shape as PuckFieldDef, plus known keys). */
export interface RawPuckField {
  type: string;
  label?: string;
  options?: Array<{ label?: string; value: unknown }>;
  min?: number;
  max?: number;
  step?: number;
  objectFields?: Record<string, RawPuckField>;
  arrayFields?: Record<string, RawPuckField>;
  defaultItemProps?: Record<string, unknown>;
  visibleWhen?: { field: string; equals: unknown };
  [key: string]: unknown;
}

export interface FieldSource {
  fields: Record<string, RawPuckField>;
  defaults?: Record<string, unknown>;
}

export interface FieldInventoryBlockInput {
  name: string;
  /** component-level authoring cap; null = unlimited. */
  maxInstances?: number | null;
  /** raw component constraints object (e.g. { padding: {min,max,step} }). */
  rawConstraints?: Record<string, unknown>;
  runtime?: FieldSource;
  resolvedRaw?: FieldSource;
  physicalRaw?: FieldSource;
}

export interface FieldInventoryInput {
  theme: string;
  /** runtime color-scheme IDs used to enumerate colorScheme scenarios. */
  colorSchemeIds: string[];
  blocks: FieldInventoryBlockInput[];
}

const ALL_MODES: PreviewMode[] = ['hot-preview', 'initial-preview', 'live'];
const ALL_VIEWPORTS: ViewportName[] = ['desktop', 'mobile'];

// --- presence bookkeeping --------------------------------------------------

interface PresenceMap {
  runtime: boolean;
  resolvedRaw: boolean;
  physicalRaw: boolean;
}

function presenceList(p: PresenceMap): FieldPresence[] {
  const out: FieldPresence[] = [];
  if (p.runtime) out.push('runtime-authoring');
  if (p.resolvedRaw) out.push('resolved-raw');
  if (p.physicalRaw) out.push('physical-raw');
  return out;
}

// --- field classification --------------------------------------------------

const BOOLEAN_TYPES = new Set(['toggle', 'boolean', 'switch']);
const SELECT_TYPES = new Set(['select', 'radio']);
const NUMERIC_TYPES = new Set(['number', 'slider']);
const TEXT_TYPES = new Set(['text', 'textarea', 'aiText', 'richText', 'rich-text']);
const DECORATIVE_TYPES = new Set(['section-header']);

function isHidden(field: RawPuckField): boolean {
  return field.type === 'hidden';
}

function isDecorative(field: RawPuckField): boolean {
  return DECORATIVE_TYPES.has(field.type);
}

function containerOf(field: RawPuckField): CapabilityRecord['container'] {
  if (isDecorative(field)) return 'decorative';
  if (field.type === 'object' || field.objectFields) return 'object';
  if (field.type === 'array' || field.arrayFields) return 'array';
  return 'leaf';
}

function visibilityOf(field: RawPuckField, isArrayItem: boolean): CapabilityRecord['visibility'] {
  if (isHidden(field)) return 'hidden';
  if (isDecorative(field)) return 'decorative';
  if (isArrayItem) return 'array-item-panel';
  return 'main-panel';
}

function isEditable(field: RawPuckField): boolean {
  return !isHidden(field) && !isDecorative(field) && containerOf(field) === 'leaf';
}

// --- constraints -----------------------------------------------------------

function leafConstraints(field: RawPuckField): FieldConstraints | undefined {
  const c: FieldConstraints = {};
  if (typeof field.min === 'number') c.min = field.min;
  if (typeof field.max === 'number' && containerOf(field) !== 'array') c.max = field.max;
  if (typeof field.step === 'number') c.step = field.step;
  if (Array.isArray(field.options)) {
    c.options = field.options.map((o) => ({ label: o.label, value: o.value }));
  }
  return Object.keys(c).length > 0 ? c : undefined;
}

function arrayConstraints(
  field: RawPuckField,
  maxInstances: number | null | undefined,
): FieldConstraints {
  const c: FieldConstraints = {};
  if (typeof field.max === 'number') c.maxItems = field.max;
  // component-level maxInstances is recorded on the array container too.
  c.maxInstances = maxInstances ?? null;
  return c;
}

// --- default pointers ------------------------------------------------------

function readPointer(root: unknown, segments: string[]): { found: boolean; value: unknown } {
  let cur: unknown = root;
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return { found: false, value: undefined };
      cur = cur[idx];
    } else if (cur && typeof cur === 'object') {
      if (!(seg in (cur as Record<string, unknown>))) return { found: false, value: undefined };
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}

// --- scenario generation ---------------------------------------------------

function scenarioId(capabilityId: string, order: number, role: string): string {
  return `${capabilityId}#${order}:${role}`;
}

function dedupeScenarios(list: ScenarioDefinition[]): ScenarioDefinition[] {
  const seen = new Set<string>();
  const out: ScenarioDefinition[] = [];
  for (const s of list) {
    const key = JSON.stringify([s.role, s.value, s.assignments ?? null]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  // re-number contiguous zero-based order, ids follow order.
  return out;
}

interface ScenarioSeed {
  role: ScenarioDefinition['role'];
  value: unknown;
  validity?: ScenarioDefinition['validity'];
  assignments?: Record<string, unknown>;
}

function buildScenarios(
  capabilityId: string,
  field: RawPuckField,
  defaultValue: unknown,
  colorSchemeIds: string[],
  condition: { targetId: string; equals: unknown } | null,
): ScenarioDefinition[] {
  const seeds: ScenarioSeed[] = [];
  const type = field.type;
  const container = containerOf(field);

  if (container === 'array') {
    const maxItems = typeof field.max === 'number' ? field.max : 1;
    // 0 / 1 / maxItems. Assume min 1 (Puck arrays default min 1) => 0 invalid.
    const counts = Array.from(new Set([0, 1, maxItems])).sort((a, b) => a - b);
    for (const count of counts) {
      const invalid = count < 1;
      seeds.push({
        role: invalid ? 'invalid-boundary' : 'array-count',
        value: count,
        validity: invalid ? 'expected-invalid' : 'expected-valid',
      });
    }
  } else if (field.type === 'colorScheme') {
    for (const id of colorSchemeIds) {
      seeds.push({ role: 'color-scheme', value: id });
    }
  } else if (BOOLEAN_TYPES.has(type)) {
    // Serialized type: toggles in these blocks serialize to 'false'/'true' strings
    // when options are string-valued; otherwise real booleans.
    const [falseVal, trueVal] = booleanSerializedPair(field);
    seeds.push({ role: 'false', value: falseVal });
    seeds.push({ role: 'true', value: trueVal });
  } else if (SELECT_TYPES.has(type) && Array.isArray(field.options)) {
    for (const opt of field.options) {
      seeds.push({ role: 'option', value: opt.value });
    }
  } else if (NUMERIC_TYPES.has(type)) {
    const min = typeof field.min === 'number' ? field.min : undefined;
    const max = typeof field.max === 'number' ? field.max : undefined;
    const step = typeof field.step === 'number' ? field.step : undefined;
    if (min !== undefined) seeds.push({ role: 'min', value: min });
    seeds.push({ role: 'default', value: defaultValue });
    if (max !== undefined) seeds.push({ role: 'max', value: max });
    if (min !== undefined && step !== undefined) {
      seeds.push({ role: 'step', value: min + step });
    }
  } else if (TEXT_TYPES.has(type)) {
    seeds.push({ role: 'empty', value: '' });
    seeds.push({ role: 'default', value: defaultValue });
    seeds.push({ role: 'a', value: `${capabilityId}::A` });
    seeds.push({ role: 'b', value: `${capabilityId}::B` });
  } else {
    // Generic leaf: empty + default + A/B synthetic.
    seeds.push({ role: 'empty', value: '' });
    seeds.push({ role: 'default', value: defaultValue });
    seeds.push({ role: 'a', value: `${capabilityId}::A` });
    seeds.push({ role: 'b', value: `${capabilityId}::B` });
  }

  // Conditional fields also get combined condition-on / condition-off scenarios.
  if (condition) {
    const off = nonMatchingCounterpart(condition.equals);
    seeds.push({
      role: 'condition-on',
      value: defaultValue,
      assignments: { [condition.targetId]: condition.equals },
    });
    seeds.push({
      role: 'condition-off',
      value: defaultValue,
      assignments: { [condition.targetId]: off },
    });
  }

  // Assemble with provisional order, dedupe, then finalize contiguous order+id.
  const provisional: ScenarioDefinition[] = seeds.map((s, i) => ({
    id: scenarioId(capabilityId, i, s.role),
    order: i,
    role: s.role,
    value: s.value,
    validity: s.validity ?? 'expected-valid',
    ...(s.assignments ? { assignments: s.assignments } : {}),
  }));
  const deduped = dedupeScenarios(provisional);
  return deduped.map((s, i) => ({
    ...s,
    order: i,
    id: scenarioId(capabilityId, i, s.role),
  }));
}

function booleanSerializedPair(field: RawPuckField): [unknown, unknown] {
  if (Array.isArray(field.options) && field.options.length >= 2) {
    // Assume [showValue, hideValue] convention; but derive true/false by value.
    const values = field.options.map((o) => o.value);
    // Prefer explicit 'true'/'false' string values if present.
    if (values.includes('false') && values.includes('true')) return ['false', 'true'];
    // Otherwise use first two option values as false/true respectively.
    return [values[1], values[0]];
  }
  return [false, true];
}

function nonMatchingCounterpart(equals: unknown): unknown {
  if (equals === 'true') return 'false';
  if (equals === 'false') return 'true';
  if (equals === true) return false;
  if (equals === false) return true;
  if (typeof equals === 'number') return equals + 1;
  if (typeof equals === 'string') return `${equals}__off`;
  return null;
}

// --- visibleWhen resolution ------------------------------------------------

/**
 * Resolve a block-relative `visibleWhen.field` to a canonical capability ID.
 * For an unqualified name inside a nested container, try the sibling path first,
 * then the block root. Never invents a target when neither exists.
 */
function resolveConditionTarget(
  theme: string,
  blockName: string,
  rawField: string,
  parentDottedPath: string,
  knownFieldPaths: Set<string>,
): string | undefined {
  const trimmed = rawField.trim();
  if (trimmed === '') return undefined;
  // Already qualified with a dot (e.g. productCard.nextPhoto) => absolute.
  const candidates: string[] = [];
  if (trimmed.includes('.')) {
    candidates.push(trimmed);
  } else {
    // Unqualified: sibling first, then block root.
    if (parentDottedPath) candidates.push(`${parentDottedPath}.${trimmed}`);
    candidates.push(trimmed);
  }
  for (const path of candidates) {
    if (knownFieldPaths.has(path)) {
      return makeCapabilityId(theme, 'block', blockName, path);
    }
  }
  return undefined;
}

// --- walker ----------------------------------------------------------------

interface WalkAccumulator {
  rows: CapabilityRecord[];
  fieldPaths: Set<string>; // all dotted field paths (for condition resolution)
  presenceByPath: Map<string, PresenceMap>;
  fieldByPath: Map<string, { field: RawPuckField; order: number; parent: string }>;
}

function collectPaths(
  fields: Record<string, RawPuckField>,
  presenceKey: keyof PresenceMap,
  acc: WalkAccumulator,
  parentDottedPath: string,
): void {
  let order = 0;
  for (const [name, field] of Object.entries(fields)) {
    const dotted = parentDottedPath ? `${parentDottedPath}.${name}` : name;
    acc.fieldPaths.add(dotted);
    let pm = acc.presenceByPath.get(dotted);
    if (!pm) {
      pm = { runtime: false, resolvedRaw: false, physicalRaw: false };
      acc.presenceByPath.set(dotted, pm);
    }
    pm[presenceKey] = true;
    if (!acc.fieldByPath.has(dotted)) {
      acc.fieldByPath.set(dotted, { field, order, parent: parentDottedPath });
    }
    // recurse
    if (field.objectFields) {
      collectPaths(field.objectFields, presenceKey, acc, dotted);
    }
    if (field.arrayFields) {
      collectPaths(field.arrayFields, presenceKey, acc, `${dotted}[]`);
    }
    order += 1;
  }
}

function pointerSegments(dottedPath: string): { concrete: string; normalized: string } {
  // slides[].heading => concrete /slides/0/heading, normalized /slides/*/heading
  const parts = dottedPath.split('.');
  const concrete: string[] = [];
  const normalized: string[] = [];
  for (const part of parts) {
    if (part.endsWith('[]')) {
      const base = part.slice(0, -2);
      concrete.push(base, '0');
      normalized.push(base, '*');
    } else {
      concrete.push(part);
      normalized.push(part);
    }
  }
  return { concrete: '/' + concrete.join('/'), normalized: '/' + normalized.join('/') };
}

function isArrayItemPath(dottedPath: string): boolean {
  return dottedPath.includes('[]');
}

function defaultReferenceFor(
  dottedPath: string,
  source: FieldSource | undefined,
  origin: DefaultReference['source'],
): DefaultReference | undefined {
  if (!source?.defaults) return undefined;
  const { concrete, normalized } = pointerSegments(dottedPath);
  const segments = concrete.split('/').filter((s) => s !== '');
  const res = readPointer(source.defaults, segments);
  if (!res.found) return undefined;
  return {
    source: origin,
    pointer: concrete,
    normalizedPointer: normalized,
    state: res.value === undefined ? 'explicit-undefined' : 'value',
    ...(res.value === undefined ? {} : { value: res.value }),
  };
}

function buildRowForField(
  input: FieldInventoryInput,
  block: FieldInventoryBlockInput,
  dottedPath: string,
  field: RawPuckField,
  order: number,
  parentDottedPath: string,
  presence: PresenceMap,
  acc: WalkAccumulator,
): CapabilityRecord {
  const theme = input.theme;
  const id = makeCapabilityId(theme, 'block', block.name, dottedPath);
  const container = containerOf(field);
  const isItem = isArrayItemPath(dottedPath);
  // A field is only authoring-editable when the constructor runtime exposes it.
  // Physical-only (disk) fields are recorded for presence but never promoted to
  // authoring; they are not editable.
  const editable = presence.runtime && isEditable(field);
  const hiddenOrDecorative = isHidden(field) || isDecorative(field);

  // condition
  let condition: { targetId: string; equals: unknown } | null = null;
  if (field.visibleWhen && typeof field.visibleWhen.field === 'string') {
    const targetId = resolveConditionTarget(
      theme,
      block.name,
      field.visibleWhen.field,
      parentDottedPath,
      acc.fieldPaths,
    );
    if (targetId) condition = { targetId, equals: field.visibleWhen.equals };
  }

  // constraints
  let constraints: FieldConstraints | undefined;
  if (container === 'array') {
    constraints = arrayConstraints(field, block.maxInstances);
  } else if (container === 'leaf') {
    constraints = leafConstraints(field);
  }

  // defaults from every presence source; array items use array-item origin.
  const defaults: DefaultReference[] = [];
  const pushDef = (src: FieldSource | undefined, origin: DefaultReference['source']) => {
    const d = defaultReferenceFor(dottedPath, src, isItem ? 'array-item' : origin);
    if (d) defaults.push(d);
  };
  pushDef(block.runtime, 'puck');
  pushDef(block.resolvedRaw, 'effective');
  pushDef(block.physicalRaw, 'physical-puck');

  const defaultValue = defaults.length > 0 ? defaults[0].value : undefined;

  // Scenarios for editable leaf fields and for authorable array containers
  // (0/1/maxItems count scenarios). An array container is authorable when the
  // runtime exposes it and it is not hidden/decorative.
  const arrayAuthorable =
    container === 'array' && presence.runtime && !hiddenOrDecorative;
  const scenarios =
    (editable && container === 'leaf') || arrayAuthorable
      ? buildScenarios(id, field, defaultValue, input.colorSchemeIds, condition)
      : [];

  const status: CapabilityRecord['status'] = hiddenOrDecorative
    ? 'PASS'
    : editable
      ? 'UNKNOWN'
      : container === 'object' || container === 'array'
        ? 'PASS'
        : 'UNKNOWN';

  const row: CapabilityRecord = {
    id,
    theme,
    surface: 'block',
    capability: dottedPath,
    fieldType: field.type,
    label: typeof field.label === 'string' ? field.label : undefined,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    visibility: visibilityOf(field, isItem),
    editable,
    persisted: !isDecorative(field),
    container,
    presence: presenceList(presence),
    order,
    ...(constraints ? { constraints } : {}),
    ...(condition ? { conditionTargetId: condition.targetId, conditionEquals: condition.equals } : {}),
    ...(defaults.length > 0 ? { defaults } : {}),
    scenarios,
    modes: ALL_MODES,
    viewports: ALL_VIEWPORTS,
    caseResults: [],
    sources: buildSources(presence),
    status,
    failureIds: [],
  };
  return row;
}

function buildSources(presence: PresenceMap): CapabilityRecord['sources'] {
  const sources: CapabilityRecord['sources'] = [];
  if (presence.runtime) sources.push({ kind: 'runtime-puck', ref: 'controller' });
  if (presence.resolvedRaw) sources.push({ kind: 'resolved-raw', ref: 'resolver' });
  if (presence.physicalRaw) sources.push({ kind: 'physical-raw', ref: 'disk' });
  return sources;
}

function blockMetadataRow(
  input: FieldInventoryInput,
  block: FieldInventoryBlockInput,
): CapabilityRecord {
  const id = makeCapabilityId(input.theme, 'block', block.name, 'authoring-constraints');
  const constraints: FieldConstraints = {
    maxInstances: block.maxInstances ?? null,
  };
  if (block.rawConstraints && Object.keys(block.rawConstraints).length > 0) {
    constraints.manifest = { ...block.rawConstraints };
  }
  return {
    id,
    theme: input.theme,
    surface: 'block',
    capability: `${block.name}.authoring-constraints`,
    editable: false,
    persisted: false,
    container: 'decorative',
    order: 0,
    constraints,
    scenarios: [],
    modes: [],
    viewports: [],
    sources: [{ kind: 'manifest', ref: block.name }],
    status: 'PASS',
    failureIds: [],
  };
}

export function inventoryFields(input: FieldInventoryInput): CapabilityRecord[] {
  const rows: CapabilityRecord[] = [];

  for (const block of input.blocks) {
    const acc: WalkAccumulator = {
      rows: [],
      fieldPaths: new Set(),
      presenceByPath: new Map(),
      fieldByPath: new Map(),
    };
    // Pass 1: collect union of paths + presence from all three sources.
    if (block.runtime) collectPaths(block.runtime.fields, 'runtime', acc, '');
    if (block.resolvedRaw) collectPaths(block.resolvedRaw.fields, 'resolvedRaw', acc, '');
    if (block.physicalRaw) collectPaths(block.physicalRaw.fields, 'physicalRaw', acc, '');

    // Pass 2: emit a row per discovered path.
    for (const [dotted, meta] of acc.fieldByPath) {
      const presence = acc.presenceByPath.get(dotted)!;
      const row = buildRowForField(
        input,
        block,
        dotted,
        meta.field,
        meta.order,
        meta.parent,
        presence,
        acc,
      );
      rows.push(row);
    }

    // Block metadata row (maxInstances + raw component constraints).
    rows.push(blockMetadataRow(input, block));
  }

  return sortById(rows);
}
