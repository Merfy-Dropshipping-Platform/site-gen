// Хэш сборки в имени файла: shell.3f9a2c1e.js, index.BvX9a_2k.css. У Vite это 8 и больше знаков base64url.
// В хэше есть цифра, заглавная буква, «_» или «-»: так «jquery.extended.js» хэшем не считается.
const HASHED_NAME = /^(?<stem>.+)\.(?<hash>[A-Za-z0-9_-]{8,})\.(?<ext>[A-Za-z0-9]+)$/;
const HASH_MARK = /[0-9A-Z_-]/;
const HASH_IN_TEXT = /([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{8,})\.(js|mjs|css|woff2?|json|svg|png|jpe?g|webp|avif)\b/g;
const VERSION_PARAM = 'v';

export type HashedName = { name: string; hash?: string };

function splitQuery(url: string): { path: string; query: string } {
  const start = url.indexOf('?');
  if (start === -1) return { path: url, query: '' };
  return { path: url.slice(0, start), query: url.slice(start) };
}

// /_astro/shell.3f9a2c1e.js → { name: '/_astro/shell.*.js', hash: '3f9a2c1e' }; без хэша имя не меняется.
export function splitHashedName(url: string): HashedName {
  const { path, query } = splitQuery(url);
  const folder = path.slice(0, path.lastIndexOf('/') + 1);
  const groups = HASHED_NAME.exec(path.slice(folder.length))?.groups;
  if (groups === undefined || !HASH_MARK.test(groups.hash)) return { name: url };
  return { name: `${folder}${groups.stem}.*.${groups.ext}${query}`, hash: groups.hash };
}

// ?v=… — метка версии файла: от сборки к сборке разная, поэтому в паспорт не идёт. Другие параметры остаются.
export function withoutVersion(url: string): string {
  const { path, query } = splitQuery(url);
  const params = new URLSearchParams(query);
  params.delete(VERSION_PARAM);
  const rest = params.toString();
  return rest === '' ? path : `${path}?${rest}`;
}

// Хэши в адресах внутри текста ошибки: «…/shell.3f9a2c1e.js:12» → «…/shell.*.js:12».
export function unhashText(text: string): string {
  return text.replace(HASH_IN_TEXT, (whole: string, stem: string, hash: string, ext: string) =>
    HASH_MARK.test(hash) ? `${stem}.*.${ext}` : whole,
  );
}
