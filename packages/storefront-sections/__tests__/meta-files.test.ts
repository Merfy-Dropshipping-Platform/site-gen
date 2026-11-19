import { describe, expect, it } from 'vitest';
import { BASED_ON_FILE, DECLINE_FILE, splitMeta } from '../src/meta-files';

// Служебные файлы тела «проверить» и «сохранить»: шлюз пересылает только files, поэтому основа и отказ едут файлами.
const FILES = { 'section.json': '{}', 'template.astro': '<div></div>' };

describe('служебные файлы тела', () => {
  it('без служебных файлов тело как было', () => {
    expect(splitMeta(FILES)).toEqual({ files: FILES });
  });

  it('основа: текст файла без пробелов и перевода строки, в файлах секции её нет', () => {
    expect(splitMeta({ ...FILES, [BASED_ON_FILE]: ' sha256:abc\n' })).toEqual({ files: FILES, basedOn: 'sha256:abc' });
  });

  it('пустой файл основы — основы нет', () => {
    expect(splitMeta({ ...FILES, [BASED_ON_FILE]: '  \n' })).toEqual({ files: FILES });
  });

  it.each([
    ['faq', 'shop:faq'],
    ['shop:faq', 'shop:faq'],
    [' shop:faq-copy \n', 'shop:faq-copy'],
  ])('отказ: имя секции %j — %s; тело из одного файла отказа без файлов секции', (text, name) => {
    expect(splitMeta({ [DECLINE_FILE]: text })).toEqual({ files: {}, decline: name });
  });

  it('имя в отказе не по форме — отказа нет', () => {
    expect(splitMeta({ [DECLINE_FILE]: 'Не Имя!' })).toEqual({ files: {} });
  });
});
