import { rebuildEvents } from '@merfy/storefront-config';
import { describe, expect, it } from 'vitest';
import { REBUILD_EVENT_INPUTS } from '../src/event-inputs';
import { ENTITY_TYPES } from '../src/inputs';
import { standInputs } from './support';

const DATA_PREFIX = 'data.';
const ENTITY_TYPE_NAMES: readonly string[] = ENTITY_TYPES;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// Путь есть во входах стенда: «revision», «site.name».
const hasPath = (path: string): boolean =>
  path.split('.').reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), standInputs) !== undefined;

// data.<тип> — тип сущности снимка; остальное — путь во входах.
const isInputPath = (path: string): boolean =>
  path.startsWith(DATA_PREFIX) ? ENTITY_TYPE_NAMES.includes(path.slice(DATA_PREFIX.length)) : hasPath(path);

describe('REBUILD_EVENT_INPUTS', () => {
  it('у каждого события блока 3 — строка, лишних строк нет', () => {
    expect(Object.keys(REBUILD_EVENT_INPUTS).sort()).toEqual(rebuildEvents.map((event) => event.id).sort());
  });

  it.each(Object.entries(REBUILD_EVENT_INPUTS))('%s меняет то, что есть во входах сборки', (_id, paths) => {
    expect(paths.filter((path) => !isInputPath(path))).toEqual([]);
  });

  it('каждый тип сущности снимка меняет хотя бы одно событие', () => {
    const covered = new Set(Object.values(REBUILD_EVENT_INPUTS).flat());
    expect(ENTITY_TYPES.filter((type) => !covered.has(`${DATA_PREFIX}${type}`))).toEqual([]);
  });
});
