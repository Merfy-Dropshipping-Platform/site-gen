import type { SectionFiles } from './format';

// Файлы для ИИ в корне папки секции (блок 14 «Секций и SDK», п. 12): правила AGENTS.md и строка @AGENTS.md в CLAUDE.md.
// Это не части секции: чтение папки и тело запроса шлюза их пропускают — проверка и сохранение их не видят.
export const AI_FILES = ['AGENTS.md', 'CLAUDE.md'] as const;

const AI_FILE_SET: ReadonlySet<string> = new Set(AI_FILES);

export const isAiFile = (path: string): boolean => AI_FILE_SET.has(path);

export const withoutAiFiles = (files: SectionFiles): SectionFiles =>
  Object.fromEntries(Object.entries(files).filter(([path]) => !isAiFile(path)));
