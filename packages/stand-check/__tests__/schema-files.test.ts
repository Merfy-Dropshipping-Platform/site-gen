import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { packagePath } from '../src/paths';
import { SCHEMA_FILES, schemaText } from '../src/schema-files';

describe('JSON-схемы рядом с данными', () => {
  it.each(SCHEMA_FILES)('$file совпадает со схемой zod — иначе запусти pnpm generate:schemas', (entry) => {
    expect(readFileSync(packagePath(entry.file), 'utf8')).toBe(schemaText(entry.schema));
  });
});
