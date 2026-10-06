import { writeFileSync } from 'node:fs';
import { packagePath } from '../src/paths';
import { SCHEMA_FILES, schemaText } from '../src/schema-files';

// Пишет JSON-схемы рядом с данными. Схему правят в zod (src), потом запускают эту команду.
for (const entry of SCHEMA_FILES) {
  writeFileSync(packagePath(entry.file), schemaText(entry.schema));
  process.stdout.write(`записал ${entry.file}\n`);
}
