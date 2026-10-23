import type { SettingField } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { compileTemplate } from '../src/compile';
import { prepareInWorker } from '../src/sandbox';
import { emptySettings } from '../src/settings';
import { emptyTrialRender } from '../src/trial';

const FIELDS: SettingField[] = [
  { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Шарфы' } },
  { id: 'text', label: 'Текст', setting: { kind: 'text', default: 'Тёплые' } },
  { id: 'button-link', label: 'Ссылка кнопки', setting: { kind: 'url', default: '/catalog' } },
  { id: 'image', label: 'Картинка', setting: { kind: 'image', default: 'https://cdn.merfy.ru/scarf.webp', maxBytes: 512000 } },
  {
    id: 'heading-size',
    label: 'Размер заголовка',
    setting: {
      kind: 'select',
      default: 'large',
      options: [
        { value: 'medium', label: 'Средний' },
        { value: 'large', label: 'Крупный' },
      ],
    },
  },
  { id: 'open-first', label: 'Первый открыт', setting: { kind: 'toggle', default: true, labels: { on: 'Да', off: 'Нет' } } },
];

const moduleOf = async (body: string): Promise<string> => {
  const compiled = await compileTemplate(`---\nconst { settings } = Astro.props;\n---\n${body}`);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.problems));
  return compiled.code;
};

const sectionWith = (body: string) => ({
  prefix: 'shop',
  files: {
    'section.json': JSON.stringify({
      sdk: 1,
      name: 'heading-letter',
      kind: 'section',
      title: 'Буквица',
      settings: [{ id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Шарфы к первым холодам' } }],
    }),
    'template.astro': `---\nconst { settings } = Astro.props;\n---\n${body}`,
  },
});

describe('пробный рендер «всё пустое»', () => {
  it('emptySettings: строки, тексты, адреса и картинки — пусто, выбор и переключатель — умолчание', () => {
    expect(emptySettings(FIELDS)).toEqual({
      heading: '',
      text: '',
      'button-link': '',
      image: '',
      'heading-size': 'large',
      'open-first': true,
    });
  });

  it('шаблон падает на пустом — render-empty-failed с текстом ошибки', async () => {
    const problems = await emptyTrialRender(await moduleOf('<p>{settings.heading.at(0).toUpperCase()}</p>'), { heading: '' });
    expect(problems.map((item) => [item.code, item.file, item.line])).toEqual([['render-empty-failed', 'template.astro', null]]);
    expect(problems[0]?.message).toMatch(/^шаблон не отрисовался с пустыми значениями настроек: .*toUpperCase/);
  }, 30_000);

  it('шаблон рендерится и с пустыми значениями — проблем нет', async () => {
    expect(await emptyTrialRender(await moduleOf('<p>{settings.heading}</p>'), { heading: '' })).toEqual([]);
  }, 30_000);

  it('проверка при сохранении: умолчания рендерятся, пустой заголовок — нет', async () => {
    const result = await prepareInWorker(sectionWith('<p>{settings.heading.at(0).toUpperCase()}</p>'));
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['render-empty-failed']);
  }, 30_000);

  it('шаблон падает и с умолчаниями — только render-failed, пустой рендер не идёт', async () => {
    const result = await prepareInWorker(sectionWith('<p>{settings.heading.missing.toUpperCase()}</p>'));
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['render-failed']);
  }, 30_000);

  it('шаблон рендерится с умолчаниями и с пустыми значениями — секция проходит', async () => {
    expect((await prepareInWorker(sectionWith('<p>{settings.heading}</p>'))).ok).toBe(true);
  }, 30_000);
});
