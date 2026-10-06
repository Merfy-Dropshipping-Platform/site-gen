import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { layoutFiles } from './content-hash';

// Сторож рендера новой темы (design.md блока 4, В4-5 Б и раздел 4): страницы магазина рисуются только из данных
// сборщика (Astro.locals.merfy). В их коде нельзя ходить в сеть, читать окружение, брать время, случайное, часовой пояс
// и язык процесса, читать запрос — адрес и порт рисовальщика случайные. Правила — таблицей. Проверяются и комментарии:
// так проще и надёжнее, чем разбирать код.

export interface GuardRule {
  id: string;
  pattern: RegExp;
  text: string;
}

export interface SourceFile {
  path: string;
  text: string;
}

export const RENDER_GUARD_RULES: readonly GuardRule[] = [
  { id: 'network', pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/, text: 'сеть: данные дают входы сборки' },
  { id: 'env', pattern: /\bprocess\.env\b|\bimport\.meta\.env\b/, text: 'окружение: данные дают входы сборки' },
  { id: 'time', pattern: /\bDate\b|\bperformance\.now\b/, text: 'время: год — вход сборки year' },
  {
    id: 'random',
    pattern: /\bMath\.random\b|\brandomUUID\b|\bgetRandomValues\b/,
    text: 'случайное: одинаковые входы — одинаковые файлы',
  },
  {
    id: 'process-locale',
    pattern: /\btoLocale(Date|Time)?String\b|\bgetTimezoneOffset\b|\bresolvedOptions\b/,
    text: 'часовой пояс и язык процесса: формат — Intl с языком магазина',
  },
  {
    id: 'request',
    pattern: /\bAstro\.(url|site|request|clientAddress|cookies|session)\b/,
    text: 'запрос: адрес и порт рисовальщика случайные',
  },
];

// Исходники страниц магазина темы — то, что рисует рисовальщик.
const SHOP_SOURCES = (themeId: string): string[] => [`themes/${themeId}/src/shop/**`];

const lineProblems =
  (file: SourceFile) =>
  (line: string, index: number): string[] =>
    RENDER_GUARD_RULES.filter((rule) => rule.pattern.test(line)).map(
      (rule) => `${file.path}:${index + 1}: ${rule.text} — ${line.trim()}`,
    );

// Нарушения: «файл:строка: правило — строка кода». Пусто — сторож доволен.
export const renderGuardProblems = (files: readonly SourceFile[]): string[] =>
  files.flatMap((file) => file.text.split('\n').flatMap(lineProblems(file)));

export async function readShopSources(root: string, themeId: string): Promise<SourceFile[]> {
  const paths = await layoutFiles(root, SHOP_SOURCES(themeId));
  return Promise.all(paths.map(async (path) => ({ path, text: await readFile(join(root, path), 'utf8') })));
}
