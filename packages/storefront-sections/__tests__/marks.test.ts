import { describe, expect, it } from 'vitest';
import { checkTemplate } from '../src/compile';
import { blockSelectProblems, markBlocks } from '../src/marks';

// Метки блоков для превью (часть 3, Р57): платформа ставит data-merfy-block корню каждого blocks.map, автор их не пишет.
const FAQ = `---
const { settings, blocks } = Astro.props;
---
<div class="flex flex-col">
  {blocks.map((block, index) => (
    <details open={settings['open-first'] && index === 0}>
      <summary>{block.settings.question}</summary>
      <div set:html={block.settings.answer}></div>
    </details>
  ))}
</div>`;
const MARK = (name: string) => ` data-merfy-block={Astro.props.__merfy.block(${name})}`;
const OPTIONS = { richtext: { section: new Set<string>(), block: new Set(['answer']) }, blocks: true };

describe('метки блоков', () => {
  it('метка — в открывающем теге корня blocks.map; остальной текст — как был', async () => {
    const marked = await markBlocks(FAQ);
    expect(marked).toEqual({
      text: FAQ.replace('<details open=', `<details${MARK('block')} open=`),
      marks: 1,
      unmarked: [],
      // Часть 6: метки — ещё и списком вставок (applyInserts), для меток правки в превью.
      inserts: [{ at: FAQ.indexOf('<details') + '<details'.length, text: MARK('block') }],
    });
  });

  it('стрелка без скобок и одиночный тег', async () => {
    const text = `---\nconst { settings, blocks } = Astro.props;\n---\n<ul>{blocks.map((item) => <li>{item.settings.text}</li>)}</ul><div>{blocks.map((b) => <img src={b.settings.src} />)}</div>`;
    const marked = await markBlocks(text);
    expect(marked.marks).toBe(2);
    expect(marked.text).toBe(text.replace('<li>', `<li${MARK('item')}>`).replace('<img src', `<img${MARK('b')} src`));
  });

  it('нет одного корневого элемента — места нет в тексте, предупреждение со строкой и колонкой', async () => {
    const text = `---\nconst { settings, blocks } = Astro.props;\n---\n<div>{blocks.map((block) => block.settings.on ? <p>a</p> : <p>b</p>)}</div>`;
    const marked = await markBlocks(text);
    expect(marked).toEqual({ text, marks: 0, unmarked: [text.indexOf('blocks.map')], inserts: [] });
    expect(blockSelectProblems(text, marked, true)).toEqual([
      {
        code: 'block-select-unavailable',
        file: 'template.astro',
        line: 4,
        column: 7,
        message: 'blocks.map без одного корневого элемента: подпункт выбирается только слева',
      },
    ]);
    expect(blockSelectProblems(text, marked, false)).toEqual([]);
  });

  it('checkTemplate: модуль — из шаблона с метками; нет blocks.map при объявленных блоках — предупреждение, модуль есть', async () => {
    const faq = await checkTemplate(FAQ, OPTIONS);
    expect(faq.problems).toEqual([]);
    expect(faq.render).toContain('__merfy');
    const plain = `---\nconst { settings } = Astro.props;\n---\n<p>{settings.heading}</p>`;
    const warned = await checkTemplate(plain, OPTIONS);
    expect(warned.problems.map((item) => [item.code, item.message])).toEqual([
      ['block-select-unavailable', 'в шаблоне нет blocks.map: подпункты выбираются только слева'],
    ]);
    expect(warned.render).not.toBeNull();
    expect((await checkTemplate(plain)).problems).toEqual([]);
  });
});
