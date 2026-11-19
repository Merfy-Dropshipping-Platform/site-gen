import { SECTION_ID, type SectionFiles } from './format';

// Служебные файлы в теле «проверить» и «сохранить» (20.11): шлюз пересылает sites только `files`, других ключей тела у
// него нет, поэтому то, что относится не к секции, а к самому сохранению, едет файлом в `files` — как файлы для ИИ
// (ai-files.ts), они не части секции: приём их не видит.
//   .merfy/based-on        — отпечаток версии библиотеки, от которой пошла копия (основа, library-update.ts);
//   .merfy/decline-update  — имя секции магазина, от обновления которой мерчант отказался (тело только из этого файла).
export const BASED_ON_FILE = '.merfy/based-on';
export const DECLINE_FILE = '.merfy/decline-update';

const META_FILES: ReadonlySet<string> = new Set([BASED_ON_FILE, DECLINE_FILE]);

export interface SplitFiles {
  files: SectionFiles; // файлы секции без служебных
  basedOn?: string;
  decline?: string; // полное имя секции магазина: `shop:faq`
}

const textOf = (files: SectionFiles, path: string): string | undefined => {
  const text = files[path]?.trim();
  return text === undefined || text === '' ? undefined : text;
};

// `faq` и `shop:faq` — одна секция; не по форме имени секции — undefined (отказ даст тот, кто читает).
const shopNameOf = (raw: string | undefined): string | undefined => {
  const bare = raw?.replace(/^shop:/, '');
  return bare !== undefined && SECTION_ID.test(bare) ? `shop:${bare}` : undefined;
};

export function splitMeta(all: SectionFiles): SplitFiles {
  const files = Object.fromEntries(Object.entries(all).filter(([path]) => !META_FILES.has(path)));
  const basedOn = textOf(all, BASED_ON_FILE);
  const decline = shopNameOf(textOf(all, DECLINE_FILE));
  return { files, ...(basedOn === undefined ? {} : { basedOn }), ...(decline === undefined ? {} : { decline }) };
}
