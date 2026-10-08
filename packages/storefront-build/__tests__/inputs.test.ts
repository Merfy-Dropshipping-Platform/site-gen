import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { parseBuildInputs } from '../src/inputs';
import { errorOf, rawInputs } from './support';

// Неверный вход → путь поля. Код у всех — inputs-invalid.
const INVALID: [string, unknown, string][] = [
  ['нет имени магазина', rawInputs((raw) => Reflect.deleteProperty(raw.site, 'name')), 'site.name'],
  ['лишнее поле сайта', rawInputs((raw) => Object.assign(raw.site, { tenantId: 't-1' })), 'site.tenantId'],
  ['адрес магазина не https', rawInputs((raw) => (raw.site.publicUrl = 'http://nova-stand.example')), 'site.publicUrl'],
  ['дата правки без миллисекунд', rawInputs((raw) => (raw.site.updatedAt = '2026-10-06T09:00:00Z')), 'site.updatedAt'],
  [
    'дата правки с поясом',
    rawInputs((raw) => (raw.site.updatedAt = '2026-10-06T12:00:00.000+03:00')),
    'site.updatedAt',
  ],
  ['отпечаток темы не sha256', rawInputs((raw) => (raw.theme.contentHash = 'sha256:abc')), 'theme.contentHash'],
  ['адрес API без /api', rawInputs((raw) => (raw.env.apiUrl = 'http://localhost:4321')), 'env.apiUrl'],
  ['год не целый', rawInputs((raw) => (raw.year = 2026.5)), 'year'],
  ['незнакомый тип сущности', rawInputs((raw) => (raw.data.entities[0].type = 'order')), 'data.entities.0.type'],
];

describe('parseBuildInputs', () => {
  it('входы стенда проходят схему как есть', () => {
    expect(parseBuildInputs(standInputsJson)).toEqual(standInputsJson);
  });

  it.each(INVALID)('%s — inputs-invalid с путём поля', (_title, raw, path) => {
    const error = errorOf(() => parseBuildInputs(raw));
    expect(error.code).toBe('inputs-invalid');
    expect(error.path).toBe(path);
  });

  it('снимок данных не получен — data-not-received: сборки нет', () => {
    const error = errorOf(() => parseBuildInputs(rawInputs((raw) => (raw.data.status = 'failed'))));
    expect(error.code).toBe('data-not-received');
    expect(error.message).toBe('data.status: снимок данных не получен целиком: сборки нет');
  });

  it('одна сущность дважды — entity-duplicate с номером второй', () => {
    const duplicate = rawInputs((raw) => raw.data.entities.push(structuredClone(raw.data.entities[3])));
    const error = errorOf(() => parseBuildInputs(duplicate));
    expect(error.code).toBe('entity-duplicate');
    expect(error.message).toBe('data.entities.7: сущность policy:privacy уже есть в снимке');
  });
});
