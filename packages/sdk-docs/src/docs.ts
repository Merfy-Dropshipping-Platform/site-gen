import { FORBIDDEN_TAGS } from '@merfy/storefront-sections';
import { API_BASE, SDK_VERSION } from './meta';
import { PAGES, type PageSpec } from './pages';
import { actionsPage } from './pages/actions';
import { behaviorsPage } from './pages/behaviors';
import { errorsPage } from './pages/errors';
import { eventsPage } from './pages/events';
import { limitsPage } from './pages/limits';
import { modulesPage } from './pages/modules';
import { sectionJsonPage } from './pages/section-json';
import { themeSettingsPage } from './pages/theme-settings';
import type { DocsSources } from './sources';

// docs.ts (блок 14, Р14-7): страницы документации из данных проверки и ядра; тела руководства — из guide/.
export type DocsFiles = Record<string, string>;
export interface DocsMeta {
  sdk: number;
  version: string;
  date: string;
  api: string;
}

const CODE_FENCE: Readonly<Record<string, string>> = { '.json': 'json', '.astro': 'astro', '.ts': 'ts', '.js': 'ts' };

const fenceOf = (path: string): string => {
  const extension = path.slice(path.lastIndexOf('.'));
  return CODE_FENCE[extension] ?? '';
};

const fileBlock = (path: string, text: string): string => `\`\`\`${fenceOf(path)}\n${text}\n\`\`\``;

// Дата документации — из первой записи changelog, а не из времени генерации: тест 1 не краснеет каждый день.
export function docsDate(changelog: string): string {
  const match = changelog.match(/^## .+? — (\d{4}-\d{2}-\d{2})$/m);
  if (match === null || match[1] === undefined) throw new Error('changelog.md: нет записи «## <версия> — ГГГГ-ММ-ДД»');
  return match[1];
}

function exampleBlock(sources: DocsSources, name: string): string {
  const files = sources.examples[name];
  if (files === undefined) throw new Error(`нет примера ${name}`);
  const blocks = Object.keys(files)
    .sort()
    .map((path) => fileBlock(path, files[path] ?? ''));
  return [`${name}/`, ...blocks].join('\n\n');
}

const forbiddenTagsText = (): string => [...FORBIDDEN_TAGS].map((tag) => `\`<${tag}>\``).join(', ');

function replacementOf(sources: DocsSources, kind: string, name: string): string {
  if (kind === 'example') return exampleBlock(sources, name);
  if (kind === 'data' && name === 'forbidden-tags') return forbiddenTagsText();
  throw new Error(`неизвестная метка ${kind}: ${name}`);
}

// Метки руководства заменяет генерация: example — файлы примера, data — данные проверки.
export function applyMarks(sources: DocsSources, text: string): string {
  return text.replaceAll(/<!-- (example|data): ([a-z-]+) -->/g, (_, kind: string, name: string) =>
    replacementOf(sources, kind, name),
  );
}

const withoutHeading = (text: string): string => {
  const lines = text.split('\n');
  return lines[0]?.startsWith('#') === true ? lines.slice(1).join('\n').replace(/^\n+/, '') : text;
};

const namesBody = (names: string): string =>
  names
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('<!--'))
    .join('\n');

const generatedBodies: Readonly<Record<string, (sources: DocsSources) => string>> = {
  'section-json.md': () => sectionJsonPage(),
  'events.md': (sources) => [eventsPage(), sources.guide.events].join('\n\n'),
  'actions.md': () => actionsPage(),
  'modules.md': () => modulesPage(),
  'behaviors.md': () => behaviorsPage(),
  'theme-settings.md': (sources) => themeSettingsPage(sources),
  'errors.md': () => errorsPage(),
  'limits.md': () => limitsPage(),
};

function bodyOf(sources: DocsSources, page: PageSpec, date: string): string {
  const guide = sources.guide[page.file.replace(/\.md$/, '').replace('/', '')] ?? '';
  const stylesBody = [guide, withoutHeading(sources.tokens)].join('\n\n');
  const guideBodies: Readonly<Record<string, string>> = {
    'start.md': applyMarks(sources, sources.guide.start ?? ''),
    'template.md': applyMarks(sources, sources.guide.template ?? ''),
    'styles.md': stylesBody,
    'names.md': namesBody(sources.names),
  };
  const body = guideBodies[page.file] ?? generatedBodies[page.file]?.(sources) ?? guide;
  return `# ${page.title}\n\n> SDK ${SDK_VERSION} · документация ${sources.version} · ${date}\n\n${body}\n`;
}

function llmsText(sources: DocsSources, date: string): string {
  const line = (page: PageSpec): string => `- [${page.title}](${page.file}): ${page.about}`;
  const lines: string[] = [];
  let section = '';
  for (const page of PAGES) {
    if (page.section !== section) {
      section = page.section;
      lines.push('', `## ${section}`);
    }
    lines.push(line(page));
  }
  return [
    '# Merfy · SDK секций витрины',
    '',
    '> Как написать секцию магазина Merfy: section.json, template.astro, script.ts.',
    `> SDK ${SDK_VERSION} · документация ${sources.version} · ${date}. Читай эту документацию, а не память: SDK новый.`,
    ...lines,
    '',
    '## Всё одним файлом',
    '- [llms-full.txt](llms-full.txt): все страницы подряд',
    '',
  ].join('\n');
}

function templatePageBody(sources: DocsSources): string {
  const blocks = Object.keys(sources.template)
    .sort()
    .map((path) => fileBlock(path, sources.template[path] ?? ''));
  return ['# Шаблон секции', '', ...blocks].join('\n\n');
}

function llmsFullText(sources: DocsSources, date: string): string {
  const pages = PAGES.map((page) =>
    page.file === 'template/AGENTS.md' ? templatePageBody(sources) : bodyOf(sources, page, date),
  );
  return [llmsText(sources, date).trimEnd(), ...pages].join('\n\n---\n\n');
}

function docsJson(sources: DocsSources, date: string, paths: readonly string[]): string {
  const meta: DocsMeta = { sdk: SDK_VERSION, version: sources.version, date, api: API_BASE };
  const files = paths.filter((path) => path !== 'docs.json').sort();
  return `${JSON.stringify({ ...meta, files }, null, 2)}\n`;
}

export function docsFiles(sources: DocsSources): DocsFiles {
  const date = docsDate(sources.guide.changelog ?? '');
  const files: DocsFiles = {};
  for (const page of PAGES) {
    if (page.file === 'template/AGENTS.md') continue;
    files[page.file] = bodyOf(sources, page, date);
  }
  for (const [path, text] of Object.entries(sources.template)) files[`template/${path}`] = text;
  files['section.schema.json'] = sources.schema;
  files['llms.txt'] = llmsText(sources, date);
  files['llms-full.txt'] = llmsFullText(sources, date);
  files['docs.json'] = docsJson(sources, date, Object.keys(files));
  return files;
}
