import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readSectionFolder, type SectionFiles } from '@merfy/storefront-sections';
import { PACKAGE_DIR } from './meta';

// Всё, что генерация читает с диска (блок 14, Р14-7); данные пакетов она импортирует сама.
export interface DocsSources {
  version: string; // version из packages/sdk-docs/package.json
  guide: Readonly<Record<string, string>>; // guide/<имя>.md → текст
  examples: Readonly<Record<string, SectionFiles>>; // examples/<имя>/ → readSectionFolder
  template: SectionFiles; // template/ — все четыре файла, с AGENTS.md и CLAUDE.md (readdir, не readSectionFolder)
  names: string; // ../storefront-sections/generated/NAMES.md
  namesJson: string; // ../storefront-sections/names.json — словарь данными, копия без изменений
  schema: string; // ../storefront-sections/generated/section.schema.json
  shared: unknown; // JSON ../storefront-sections/generated/shared-settings.json
  tokens: string; // ../tokens/generated/TOKENS.md
}

const readText = async (path: string): Promise<string> => readFile(path, 'utf8');

async function readVersion(packageDir: string): Promise<string> {
  const parsed: unknown = JSON.parse(await readText(join(packageDir, 'package.json')));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('package.json: не объект');
  const version: unknown = Reflect.get(parsed, 'version');
  if (typeof version !== 'string') throw new Error('package.json: нет строки version');
  return version;
}

async function readGuide(packageDir: string): Promise<Record<string, string>> {
  const names = (await readdir(join(packageDir, 'guide'))).filter((name) => name.endsWith('.md')).sort();
  const texts = await Promise.all(names.map((name) => readText(join(packageDir, 'guide', name))));
  return Object.fromEntries(names.map((name, index) => [name.replace(/\.md$/, ''), texts[index] ?? '']));
}

async function readExamples(packageDir: string): Promise<Record<string, SectionFiles>> {
  const names = (await readdir(join(packageDir, 'examples'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const folders = await Promise.all(names.map((name) => readSectionFolder(join(packageDir, 'examples', name))));
  return Object.fromEntries(names.map((name, index) => [name, folders[index] ?? {}]));
}

async function readTemplate(packageDir: string): Promise<SectionFiles> {
  const names = (await readdir(join(packageDir, 'template'))).sort();
  const texts = await Promise.all(names.map((name) => readText(join(packageDir, 'template', name))));
  return Object.fromEntries(names.map((name, index) => [name, texts[index] ?? '']));
}

async function readShared(sectionsDir: string): Promise<unknown> {
  return JSON.parse(await readText(join(sectionsDir, 'generated', 'shared-settings.json')));
}

export async function readSources(packageDir: string = PACKAGE_DIR): Promise<DocsSources> {
  const sectionsDir = join(packageDir, '../storefront-sections');
  return {
    version: await readVersion(packageDir),
    guide: await readGuide(packageDir),
    examples: await readExamples(packageDir),
    template: await readTemplate(packageDir),
    names: await readText(join(sectionsDir, 'generated', 'NAMES.md')),
    namesJson: await readText(join(sectionsDir, 'names.json')),
    schema: await readText(join(sectionsDir, 'generated', 'section.schema.json')),
    shared: await readShared(sectionsDir),
    tokens: await readText(join(packageDir, '../tokens/generated/TOKENS.md')),
  };
}
