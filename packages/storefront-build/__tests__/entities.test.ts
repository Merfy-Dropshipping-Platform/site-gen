import { describe, expect, it } from 'vitest';
import { hashOf } from '../src/canonical';
import { entityHashes, entityKey } from '../src/entities';
import { changedInputs, standInputs } from './support';

const SCARF = 'product:00000000-0000-4000-8000-000000000101';

describe('entityHashes', () => {
  it('сайт и каждая сущность снимка, ключи — тип:id по порядку', () => {
    expect(Object.keys(entityHashes(standInputs))).toEqual([
      'billing:main',
      'collection:00000000-0000-4000-8000-000000000201',
      'contacts:main',
      'policy:privacy',
      'product:00000000-0000-4000-8000-000000000101',
      'product:00000000-0000-4000-8000-000000000102',
      'publication:00000000-0000-4000-8000-000000000301',
      'site:00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('хэш сущности — по ней целиком', () => {
    expect(entityHashes(standInputs)[SCARF]).toBe(hashOf(standInputs.data.entities[0]));
  });

  it('снимок в другом порядке — та же карта и тот же порядок ключей', () => {
    const shuffled = changedInputs((inputs) => inputs.data.entities.reverse());
    expect(Object.entries(entityHashes(shuffled))).toEqual(Object.entries(entityHashes(standInputs)));
  });

  it('правка цены меняет хэш только этой сущности', () => {
    const before = entityHashes(standInputs);
    const after = entityHashes(changedInputs((inputs) => (inputs.data.entities[0].data.price = 2300)));
    const changed = Object.keys(before).filter((key) => before[key] !== after[key]);
    expect(changed).toEqual([SCARF]);
  });

  it('дата правки входит в хэш: от неё lastmod страницы', () => {
    const touched = changedInputs((inputs) => (inputs.data.entities[0].updatedAt = '2026-10-06T10:00:00.000Z'));
    expect(entityHashes(touched)[SCARF]).not.toBe(entityHashes(standInputs)[SCARF]);
  });

  it('ключ сущности — тип и id через двоеточие', () => {
    expect(entityKey('policy', 'privacy')).toBe('policy:privacy');
  });
});
