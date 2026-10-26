import { beforeAll, describe, expect, it } from 'vitest';
import { docsFiles, type DocsFiles } from '../src/docs';
import { readSources } from '../src/sources';

// Строки документации по приёмке блока 15 (часть 15в, Р15в-7; журнал 15а, Б15-8): чего не хватило ИИ мерчанта.
let files: DocsFiles;

beforeAll(async () => {
  files = docsFiles(await readSources());
});

describe('документация: находки приёмки блока 15', () => {
  it('script.md: show и hide — атрибут hidden; скрытое при загрузке — атрибутом, не классом', () => {
    expect(files['script.md']).toContain('не классом `hidden`');
  });

  it('script.md: подписка — тексты ответов, как у пяти тем, и отказ limit', () => {
    expect(files['script.md']).toContain('Спасибо! Мы отправим вам приветственное письмо.');
    expect(files['script.md']).toContain('Вы уже подписаны на рассылку.');
    expect(files['script.md']).toContain('`limit`');
  });

  it('template.md: один <h1> на странице и <label> у поля формы', () => {
    expect(files['template.md']).toContain('Один `<h1>` на странице');
    expect(files['template.md']).toContain('`<label>`');
  });

  it('section-json.md: поля с записями — только у секции; labels у toggle — объект on/off', () => {
    expect(files['section-json.md']).toContain('только у полей секции');
    expect(files['section-json.md']).toContain('{ "on": "…", "off": "…" }');
  });

  it('behaviors.md: список параметра — через пробел; есть zoom', () => {
    expect(files['behaviors.md']).toContain('список через пробел');
    expect(files['behaviors.md']).not.toContain('список через запятую');
    expect(files['behaviors.md']).toContain('## zoom');
  });

  it('data.md: у карточек коллекции — images', () => {
    expect(files['data.md']).toContain('`image`, `images`, `available`');
  });
});
