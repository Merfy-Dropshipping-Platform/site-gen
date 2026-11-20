import { describe, expect, it } from 'vitest';
import type { SectionFiles } from '../src/format';
import { libraryKeyOf, libraryNameOf, type LibraryIndex } from '../src/library-copy';
import type { LibraryHistory } from '../src/library-history';
import { libraryBaseOf } from '../src/library-update';

// Основа первой правки новой секции без явного basedOn (20.11): файлы совпали с текущей версией библиотеки по отпечатку
// без name, title и концевых пробелов — основа это точный отпечаток этой версии из истории.
const manifest = (name: string, title: string): string =>
  JSON.stringify({ sdk: 1, name, kind: 'section', title, settings: [{ id: 'heading', kind: 'string' }] });
const template = '<section>\n<h2>{settings.heading}</h2>\n</section>\n';
const library = (name = 'faq', title = 'Вопросы'): SectionFiles => ({
  'section.json': manifest(name, title),
  'template.astro': template,
});

const KEY = libraryKeyOf(library());
const INDEX: LibraryIndex = { [KEY ?? '']: 'faq' };
const HISTORY: LibraryHistory = {
  'sha256:faq3': { name: 'faq', version: 3 },
  'sha256:faq4': { name: 'faq', version: 4 },
};

describe('libraryBaseOf', () => {
  it('копия неизменённой библиотечной секции под новым именем — основа: отпечаток текущей версии', () => {
    const copy = library('faq-copy', 'Вопросы (копия)');
    expect(libraryBaseOf(copy, INDEX, HISTORY)).toBe('sha256:faq4');
  });

  it('концевые пробелы и перевод строки в файлах не мешают', () => {
    const files = { ...library('my-faq'), 'template.astro': template.replace(/\n/g, '  \r\n') };
    expect(libraryBaseOf(files, INDEX, HISTORY)).toBe('sha256:faq4');
  });

  it('секция библиотеки как есть тоже получает основу: её версия', () => {
    expect(libraryBaseOf(library(), INDEX, HISTORY)).toBe('sha256:faq4');
  });

  it('изменённая копия — основы нет', () => {
    const changed = { ...library('faq-copy'), 'template.astro': `${template}<p>свой текст</p>\n` };
    expect(libraryBaseOf(changed, INDEX, HISTORY)).toBeUndefined();
  });

  it('параметры другие — основы нет', () => {
    const files = {
      ...library('faq-copy'),
      'section.json': JSON.stringify({ ...JSON.parse(manifest('faq-copy', 'Х')), settings: [] }),
    };
    expect(libraryBaseOf(files, INDEX, HISTORY)).toBeUndefined();
  });

  it('совпали с библиотекой, но секции нет в истории — основы нет', () => {
    expect(libraryBaseOf(library('faq-copy'), INDEX, {})).toBeUndefined();
  });

  it('нет section.json или он не разбирается — основы нет', () => {
    expect(libraryBaseOf({ 'template.astro': template }, INDEX, HISTORY)).toBeUndefined();
    expect(libraryBaseOf({ 'section.json': '{', 'template.astro': template }, INDEX, HISTORY)).toBeUndefined();
  });

  it('libraryNameOf: имя библиотечной секции по отпечатку, не совпало — undefined', () => {
    expect(libraryNameOf(library('x', 'Y'), INDEX)).toBe('faq');
    expect(libraryNameOf({ ...library(), 'template.astro': 'другое' }, INDEX)).toBeUndefined();
  });
});
