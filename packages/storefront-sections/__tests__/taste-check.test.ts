import { describe, expect, it } from 'vitest';
import { isWarning } from '../src/problems';
import { prepareSection } from '../src/prepare';
import { tasteProblems } from '../src/taste-check';

// Проверки вкуса (кнопки от 44 px, прокрутка вбок, «уменьшить движение»): предупреждения по одному на место, с файлом
// и строкой; на правильном коде их нет. Правила читают классы шаблона по элементам и текст скрипта.
const template = (body: string): Record<string, string> => ({ 'template.astro': body });
const found = async (files: Record<string, string>): Promise<string[]> =>
  (await tasteProblems(files)).map((item) => `${item.code} ${item.file}:${item.line}:${item.column}`);
const SCRIPT_HEAD = "import { defineSection } from '@merfy/shell';\n";

describe('кнопки от 44 px', () => {
  it('button с h-8 — предупреждение с местом класса', async () => {
    const result = await tasteProblems(
      template('<div>\n  <button type="button" class="h-8 px-4 bg-primary">Купить</button>\n</div>'),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ code: 'taste-button-height', file: 'template.astro', line: 2, column: 32 });
    expect(result[0]?.message).toContain('h-8 — 32 px, меньше 44 px');
  });

  it('ссылка-кнопка (bg-primary или rounded-button) и role="button" — тоже кнопки', async () => {
    expect(await found(template('<a href="/cart" class="rounded-button min-h-10 px-4">В корзину</a>'))).toEqual([
      'taste-button-height template.astro:1:39',
    ]);
    expect(await found(template('<div role="button" class="h-6">x</div>'))).toHaveLength(1);
  });

  it('class:list: класс из объекта тоже читается', async () => {
    expect(await found(template("<button class:list={['px-4', { 'h-9': settings.small }]}>x</button>"))).toHaveLength(
      1,
    );
  });

  it('h-11 и выше, min-h-11 рядом с малым h, обычная ссылка и div с h-8 — без предупреждений', async () => {
    expect(await found(template('<button class="h-11 px-4">Купить</button>'))).toEqual([]);
    expect(await found(template('<button class="h-14">Купить</button>'))).toEqual([]);
    expect(await found(template('<button class="h-8 min-h-11">Купить</button>'))).toEqual([]);
    expect(await found(template('<a href="/about" class="h-8 underline">О нас</a>'))).toEqual([]);
    expect(await found(template('<div class="h-8 bg-primary">Метка</div>'))).toEqual([]);
  });
});

describe('прокрутка вбок', () => {
  it('ширина больше 375 px без max-w — предупреждение, в том числе именованная и min-w', async () => {
    const result = await tasteProblems(template('<div class="w-150">a</div>'));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ code: 'taste-overflow', line: 1, column: 13 });
    expect(await found(template('<div class="min-w-96">a</div>'))).toHaveLength(1);
    expect(await found(template('<div class="w-xl">a</div>'))).toHaveLength(1);
  });

  it('w-screen (100vw) и whitespace-nowrap — предупреждения, даже с max-w', async () => {
    expect(await found(template('<div class="w-screen max-w-full">a</div>'))).toHaveLength(1);
    expect(await found(template('<p class="whitespace-nowrap">Длинный текст</p>'))).toHaveLength(1);
  });

  it('w-94 (376 px) — на границе, w-93 (372 px) — нет', async () => {
    expect(await found(template('<div class="w-94">a</div>'))).toHaveLength(1);
    expect(await found(template('<div class="w-93">a</div>'))).toEqual([]);
  });

  it('с max-w, w-full, max-w сам по себе и широкие только от md: — без предупреждений', async () => {
    expect(await found(template('<div class="w-150 max-w-full">a</div>'))).toEqual([]);
    expect(await found(template('<div class="w-full max-w-page">a</div>'))).toEqual([]);
    expect(await found(template('<div class="w-full md:w-150">a</div>'))).toEqual([]);
    expect(await found(template('<p class="whitespace-normal">a</p>'))).toEqual([]);
  });
});

describe('«уменьшить движение»: шаблон', () => {
  it('animate-*, transition-*, scroll-smooth без отмены — по предупреждению на класс', async () => {
    expect(await found(template('<div class="animate-pulse">a</div>'))).toEqual(['taste-motion template.astro:1:13']);
    expect(await found(template('<a class="transition-colors hover:bg-accent">a</a>'))).toHaveLength(1);
    expect(await found(template('<section class="scroll-smooth">a</section>'))).toHaveLength(1);
  });

  it('motion-safe: перед классом или motion-reduce:*-none рядом — без предупреждений', async () => {
    expect(await found(template('<div class="motion-safe:animate-pulse">a</div>'))).toEqual([]);
    expect(
      await found(template('<div class="transition-transform duration-300 motion-reduce:transition-none">a</div>')),
    ).toEqual([]);
    expect(await found(template('<div class="animate-spin motion-reduce:animate-none">a</div>'))).toEqual([]);
    expect(await found(template('<div class="transition-none animate-none">a</div>'))).toEqual([]);
  });

  it('отмена другого вида движения не закрывает остальное', async () => {
    expect(
      await found(template('<div class="animate-pulse transition-all motion-reduce:transition-none">a</div>')),
    ).toEqual(['taste-motion template.astro:1:13']);
  });
});

describe('«уменьшить движение»: скрипт', () => {
  const script = (body: string): Record<string, string> => ({ 'script.ts': `${SCRIPT_HEAD}${body}` });

  it('animate( и requestAnimationFrame без matchMedia — предупреждение с файлом и строкой', async () => {
    const result = await tasteProblems(
      script(
        'export default defineSection({\n  mount(el) {\n    el.node.animate([], 300);\n    requestAnimationFrame(() => {});\n  },\n});',
      ),
    );
    expect(result.map((item) => `${item.code} ${item.file}:${item.line}:${item.column}`)).toEqual([
      'taste-motion script.ts:4:5',
      'taste-motion script.ts:5:5',
    ]);
  });

  it('ctx.animate SDK и комментарии — без предупреждений', async () => {
    expect(
      await found(script('export default defineSection({ mount(el, ctx) { ctx.animate(el, [], {}); } });')),
    ).toEqual([]);
    expect(await found(script('// animate( позже\nexport default defineSection({ mount() {} });'))).toEqual([]);
  });

  it("с matchMedia('(prefers-reduced-motion…') в файле — без предупреждений", async () => {
    const body =
      "export default defineSection({ mount() { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; requestAnimationFrame(() => {}); } });";
    expect(await found(script(body))).toEqual([]);
  });

  it('section.json и шаблон без скрипта не мешают', async () => {
    expect(await found({ 'section.json': '{"name":"animate("}' })).toEqual([]);
  });
});

describe('HTML-текст: класс rich-text', () => {
  const manifest = JSON.stringify({
    sdk: 1,
    name: 'rich',
    kind: 'section',
    title: 'Текст',
    settings: [
      { id: 'text', label: 'Текст', setting: { kind: 'richtext', default: '<p>Текст</p>' } },
      { id: 'title', label: 'Заголовок', setting: { kind: 'string', default: 'Заголовок', ai: 'title' } },
      { id: 'policy', label: 'Политика', setting: { kind: 'policy' } },
    ],
    blocks: {
      item: {
        title: 'Пункт',
        limit: 4,
        settings: [{ id: 'answer', label: 'Ответ', setting: { kind: 'richtext', default: '<p>Ответ</p>' } }],
      },
    },
  });
  const files = (body: string): Record<string, string> => ({ 'section.json': manifest, 'template.astro': body });

  it('richtext-поле, html записи и html политики без класса — по предупреждению на место set:html', async () => {
    expect(await found(files('<div class="text-base" set:html={settings.text}></div>'))).toEqual([
      'taste-rich-text template.astro:1:24',
    ]);
    expect(await found(files('<div class="text-base" set:html={page.record.html}></div>'))).toHaveLength(1);
    expect(await found(files('<div set:html={settings.policy.html}></div>'))).toHaveLength(1);
    expect(
      await found(files('<div>{blocks.map((block) => <div set:html={block.settings.answer} />)}</div>')),
    ).toHaveLength(1);
    const [item] = await tasteProblems(files('<div set:html={settings.text}></div>'));
    expect(item?.message).toContain('rich-text');
    expect(item !== undefined && isWarning(item)).toBe(true);
  });

  it('с классом rich-text (class и class:list) — без предупреждений', async () => {
    expect(await found(files('<div class="rich-text text-base" set:html={settings.text}></div>'))).toEqual([]);
    expect(
      await found(files("<div class:list={['rich-text', 'max-w-2xl']} set:html={page.record.html}></div>")),
    ).toEqual([]);
  });

  it('string и text с ai (только <em> и <strong>) класса не требуют', async () => {
    expect(await found(files('<h2 class="m-0" set:html={settings.title}></h2>'))).toEqual([]);
  });

  it('без section.json id richtext неизвестны: проверяются только html записи и политики', async () => {
    expect(await found(template('<div set:html={settings.text}></div>'))).toEqual([]);
    expect(await found(template('<div set:html={page.record.html}></div>'))).toHaveLength(1);
  });
});

describe('в приёме секции', () => {
  const manifest = JSON.stringify({ sdk: 1, name: 'taste', kind: 'section', title: 'Вкус' });
  const bad =
    '<div class="w-150"><button type="button" class="h-8 rounded-button bg-primary px-4 text-primary-foreground">Купить</button><p class="animate-pulse">Скоро</p></div>';
  const good =
    '<div class="w-150 max-w-full"><button type="button" class="h-11 rounded-button bg-primary px-4 text-primary-foreground">Купить</button><p class="motion-safe:animate-pulse">Скоро</p></div>';

  it('кнопка 32 px, ширина 600 px и анимация: секция принята, три предупреждения', async () => {
    const result = await prepareSection({ prefix: 'shop', files: { 'section.json': manifest, 'template.astro': bad } });
    expect(result.ok).toBe(true);
    // Надписи «Купить» и «Скоро» в разметке — предупреждение о составе секции (authoring-check.ts), здесь не в счёт.
    const warnings = (result.ok ? result.section.warnings : []).filter((item) => item.code !== 'taste-literal-text');
    expect(warnings.map((item) => item.code)).toEqual(['taste-overflow', 'taste-button-height', 'taste-motion']);
    expect(warnings.every((item) => isWarning(item))).toBe(true);
  });

  it('тот же код исправленный — предупреждений нет', async () => {
    const result = await prepareSection({
      prefix: 'shop',
      files: { 'section.json': manifest, 'template.astro': good },
    });
    // Остаётся только предупреждение о надписях в разметке (authoring-check.ts): правил вкуса нет.
    expect(result.ok && result.section.warnings.map((item) => item.code)).toEqual(['taste-literal-text']);
  });
});
