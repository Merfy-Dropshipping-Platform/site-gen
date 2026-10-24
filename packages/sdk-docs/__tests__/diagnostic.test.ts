import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { PACKAGE_DIR } from '../src/meta';

// ВРЕМЕННЫЙ диагностический тест (удалить после разбора CI).
describe('diagnostic', () => {
  it('окружение и файлы', () => {
    const disk = readFileSync(join(PACKAGE_DIR, 'generated/section.schema.json'), 'utf8');
    const neighbor = readFileSync(join(PACKAGE_DIR, '../storefront-sections/generated/section.schema.json'), 'utf8');
    const zodPkg: unknown = JSON.parse(readFileSync(join(PACKAGE_DIR, '../storefront-sections/node_modules/zod/package.json'), 'utf8'));
    process.stdout.write(`zod at neighbor: ${typeof zodPkg === 'object' && zodPkg !== null ? Reflect.get(zodPkg, 'version') : '?'}\n`);
    process.stdout.write(`disk: ${disk.length} chars, mtime ${statSync(join(PACKAGE_DIR, 'generated/section.schema.json')).mtime.toISOString()}\n`);
    process.stdout.write(`neighbor: ${neighbor.length} chars, mtime ${statSync(join(PACKAGE_DIR, '../storefront-sections/generated/section.schema.json')).mtime.toISOString()}\n`);
    process.stdout.write(`disk has ai: ${disk.includes('"ai"')}, neighbor has ai: ${neighbor.includes('"ai"')}\n`);
    process.stdout.write(`disk has segment: ${disk.includes('"segment"')}, neighbor has segment: ${neighbor.includes('"segment"')}\n`);
    const rootZod = readFileSync(join(PACKAGE_DIR, '../../node_modules/zod/package.json'), 'utf8');
    const parsed: unknown = JSON.parse(rootZod);
    process.stdout.write(`zod at root: ${typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : '?'}\n`);
    process.stdout.write(`imported zod: ${z.string !== undefined ? 'ok' : '?'}\n`);
    expect(true).toBe(true);
  });
});
