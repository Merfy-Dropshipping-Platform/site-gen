/**
 * Сторож копии @merfy/forms (спека 120, карточка 1.5): копия — слепок собранного пакета,
 * её делает `pnpm forms:sync`. Проверяем: руками не правили (хеш), версия 0.2.0,
 * общий набор случаев validateV2 проходит на копии так же, как в самом пакете.
 * Копию пока никто не импортирует, кроме этого теста (форму на ней строит карточка 5.1).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod/v4';
import { formV2Schema, validateV2 } from '../runtime/forms-vendor/index.js';
import type { FormV2 } from '../runtime/forms-vendor/index.js';

const VENDOR_DIR = resolve(__dirname, '../runtime/forms-vendor');
const VERSION_FILE = 'VERSION.json';
const EXPECTED_VERSION = '0.2.0';
const HAND_EDIT_MESSAGE = 'копию @merfy/forms не правят руками — pnpm forms:sync';

const listFiles = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );

// Тот же порядок и состав, что в scripts/sync-forms.mjs: пути по сортировке, `путь\n` + содержимое.
const hashVendorFiles = (): string => {
  const paths = listFiles(VENDOR_DIR)
    .filter((path) => path !== VERSION_FILE)
    .sort();
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(`${path}\n`);
    hash.update(readFileSync(join(VENDOR_DIR, path)));
  }
  return hash.digest('hex');
};

const versionSchema = z.object({
  package: z.string(),
  version: z.string(),
  sha256: z.string(),
});

const readVersionFile = () =>
  versionSchema.parse(JSON.parse(readFileSync(join(VENDOR_DIR, VERSION_FILE), 'utf8')));

const contactsSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  social: z.string().optional(),
  consent: z.boolean().optional(),
});

const caseSchema = z.object({
  name: z.string(),
  form: z.string(),
  values: z.record(z.string(), z.unknown()),
  contacts: contactsSchema,
  filesCounts: z.record(z.string(), z.number()),
  expected: z.object({
    items: z.record(z.string(), z.string()),
    consent: z.string().optional(),
  }),
});

const casesSchema = z.object({
  version: z.literal(1),
  forms: z.record(z.string(), formV2Schema),
  cases: z.array(caseSchema),
});

const casesFile: unknown = JSON.parse(
  readFileSync(join(VENDOR_DIR, 'cases', 'validate-v2.cases.json'), 'utf8'),
);
const file = casesSchema.parse(casesFile);
const forms: Record<string, FormV2> = file.forms;

describe('копия @merfy/forms', () => {
  it('хеш файлов совпадает с VERSION.json: руками не правили', () => {
    // Текст-подсказка стоит ключом: при расхождении он попадает в вывод сравнения.
    expect({ [HAND_EDIT_MESSAGE]: hashVendorFiles() }).toEqual({
      [HAND_EDIT_MESSAGE]: readVersionFile().sha256,
    });
  });

  it('версия копии — 0.2.0', () => {
    expect(readVersionFile().version).toBe(EXPECTED_VERSION);
  });

  it.each(file.cases)('общий случай validateV2: $name', (testCase) => {
    const errors = validateV2(forms[testCase.form], testCase.values, testCase.contacts, testCase.filesCounts);
    expect(errors).toEqual(testCase.expected);
  });
});
