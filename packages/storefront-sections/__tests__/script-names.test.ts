import { parse } from '@astrojs/compiler-rs';
import { describe, expect, it } from 'vitest';
import type { SectionManifest } from '../src/format';
import { checkScriptSource } from '../src/script-check';
import { NO_FACTS } from '../src/script-facts';
import { scriptMetaOf } from '../src/script-meta';
import { nameProblems } from '../src/script-names';
import { templateMarkup } from '../src/template-markup';

const markupOf = async (text: string) => templateMarkup((await Promise.resolve(parse(text))).ast, text);
const manifestOf = (fields: Partial<SectionManifest> = {}): SectionManifest => ({
  sdk: 1,
  name: 'scarf-match',
  kind: 'section',
  title: 'Подбор шарфа',
  settings: [],
  ...fields,
});
const MANIFEST = manifestOf({ uses: ['cart', 'theme'] });
const HEAD = "import { defineSection } from '@merfy/shell';\n";
const SCRIPT = `${HEAD}export default defineSection({\n  mount(el, ctx) {\n    ctx.listen('merfy:cart:ad', () => undefined);\n    ctx.listen('merfy:page:view', () => undefined);\n    ctx.listen('shop:size-pick:changed', () => undefined);\n    ctx.listen('cart-add', () => undefined);\n  },\n  actions: { pick() {} },\n});\n`;
const TEMPLATE = `<div>
  <button type="button" data-action="pick">Серое</button>
  <button type="button" data-action="pik hover:pick mouseenter:pick">Чёрное</button>
  <button type="button" data-action="cart.ad cart.add">В корзину</button>
  <form data-action="newsletter.subscribe"></form>
  <p data-action={'x'}></p>
</div>`;

describe('сверка имён', () => {
  it('event-unknown и action-unknown с местом и похожим именем', async () => {
    const facts = checkScriptSource({ 'script.ts': SCRIPT }, 'script.ts').facts;
    const found = nameProblems({
      manifest: MANIFEST,
      markup: await markupOf(TEMPLATE),
      facts,
      scriptEntry: 'script.ts',
    });
    expect(found.map((item) => `${item.code} ${item.file}:${item.line}:${item.column} ${item.message}`)).toEqual([
      'event-unknown script.ts:4:16 события «merfy:cart:ad» нет в каталоге событий SDK. Похожее: «merfy:cart:add»',
      'event-unknown script.ts:7:16 «cart-add»: событие — merfy:<объект>:<действие> из каталога SDK или <автор>:<секция>:<событие>',
      'action-unknown template.astro:3:38 действия «pik» нет в actions script.ts. Есть: «pick». Похожее: «pick»',
      'action-unknown template.astro:3:42 событие «hover» в data-action не из списка: click, dblclick, input, change, submit, keydown, keyup, focusin, focusout, pointerdown, pointerup, pointerenter, pointerleave, mouseenter, mouseleave, scroll, toggle, transitionend, animationend, load',
      'action-unknown template.astro:4:38 действия SDK «cart.ad» нет. Похожее: «cart.add»',
      'action-unknown template.astro:5:22 действие newsletter.subscribe — только из скрипта секции: ctx.newsletter.subscribe(…)',
    ]);
  });

  it('без скрипта своё действие — action-unknown; действие SDK — можно', async () => {
    const markup = await markupOf(
      '<div><button data-action="pick">x</button><button data-action="favorites.toggle">♡</button></div>',
    );
    const found = nameProblems({ manifest: MANIFEST, markup, facts: null, scriptEntry: null });
    expect(found.map((item) => item.message)).toEqual([
      'у секции нет скрипта: действие «pick» пишется в actions script.ts',
    ]);
  });

  it('ключи actions не известны — свои действия не сверяются', async () => {
    const markup = await markupOf('<button data-action="anything">x</button>');
    expect(
      nameProblems({ manifest: MANIFEST, markup, facts: { ...NO_FACTS, actions: null }, scriptEntry: 'script.ts' }),
    ).toEqual([]);
  });

  it('класс toggleClass с [ ], кавычкой или пробелом — class-arbitrary в файле скрипта', () => {
    const facts = { ...NO_FACTS, actions: [], classes: ['bg-primary', 'bg-[url(x)]', 'hover:underline', 'w-1/2'] };
    const found = nameProblems({ manifest: MANIFEST, markup: { actions: [] }, facts, scriptEntry: 'script.ts' });
    expect(found.map((item) => `${item.code} ${item.file} ${item.message}`)).toEqual([
      'class-arbitrary script.ts класс «bg-[url(x)]» в toggleClass: только имя утилиты из словаря — буквы, цифры и - _ : / .',
    ]);
  });

  it('script_meta: uses — модули SDK из uses, parts — плюс модули действий разметки, classes — из скрипта', async () => {
    const markup = await markupOf('<div><button data-action="click:favorites.toggle pick">x</button></div>');
    expect(scriptMetaOf(MANIFEST, markup, { ...NO_FACTS, classes: ['bg-primary'] })).toEqual({
      uses: ['cart'],
      parts: ['cart', 'favorites'],
      classes: ['bg-primary'],
    });
    expect(scriptMetaOf(manifestOf(), { actions: [] }, null)).toEqual({ uses: [], parts: [], classes: [] });
  });
});
