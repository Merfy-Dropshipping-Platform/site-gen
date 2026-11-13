import { EASINGS } from '@merfy/shell/behaviors/catalog';
import { PRESETS } from '@merfy/shell/behaviors/presets';
import { FORBIDDEN_IN_VALUE } from '@merfy/shell/keyframes';
import { LIBRARIES, LIBRARY_NAMES } from '@merfy/shell/libraries';
import { beforeAll, describe, expect, it } from 'vitest';
import { docsFiles, type DocsFiles } from '../src/docs';
import { readSources } from '../src/sources';

// motion.md (спека «Анимации»): таблицы строятся из кода SDK — новый пресет, запрет в значении, кривая или библиотека
// попадают в справку сами, а страница прямо говорит про выключенное «Появление секций».
let files: DocsFiles;

beforeAll(async () => {
  files = docsFiles(await readSources());
});

describe('motion.md', () => {
  it('каждый пресет, запрет в значении, кривая и библиотека из кода — строка таблицы', () => {
    const text = files['motion.md'] ?? '';
    for (const name of Object.keys(PRESETS)) expect(text, name).toContain(`| \`${name}\` |`);
    for (const [part, why] of FORBIDDEN_IN_VALUE) expect(text, part).toContain(`| \`${part}\` | ${why} |`);
    for (const name of Object.keys(EASINGS)) expect(text, name).toContain(`| \`'${name}'\` |`);
    for (const name of LIBRARY_NAMES) {
      const row = text.split('\n').find((line) => line.startsWith(`| \`"lib:${name}"\` |`)) ?? '';
      expect(row, name).toContain(`${LIBRARIES[name].version}, ${LIBRARIES[name].license}`);
      for (const method of LIBRARIES[name].api) expect(row, method).toContain(`ctx.lib.${name}.${method}`);
    }
  });

  it('13.11: свойство любое; scroll, inView, lib:motion и переходы описаны, закрытое ушло из «Чего пока нет»', () => {
    const text = files['motion.md'] ?? '';
    for (const part of [
      '## ctx.scroll',
      '## ctx.inView',
      '## Полный Motion (lib:motion)',
      '## Переход между страницами',
    ])
      expect(text, part).toContain(part);
    expect(text).toContain('@property');
    expect(text).toContain('choice-page-transition');
    expect(text).toContain('data-vt');
    const missing = text.slice(text.indexOf('## Чего пока нет'));
    for (const closed of ['таймлайн', 'счётчик', 'View Transitions']) expect(missing, closed).not.toContain(closed);
  });

  it('ссылка кода lib-unknown ведёт на заголовок страницы; uses "lib:…" описан в section.json и anatomy', () => {
    expect(files['motion.md']).toMatch(/^## Полный Motion \(lib:motion\)$/m);
    expect(files['section-json.md']).toContain('lib:');
    expect(files['anatomy.md']).toContain('"lib:motion"');
  });

  it('готовые классы движения описаны в styles.md', () => {
    for (const name of ['animate-float', 'animate-shimmer', 'animate-spin-slow', 'scroll-reveal'])
      expect(files['styles.md'], name).toContain(name);
  });

  it('в таблице пресетов — время и кривая из PRESETS', () => {
    const row = (files['motion.md'] ?? '').split('\n').find((line) => line.startsWith('| `fade-up` |')) ?? '';
    expect(row).toContain(`| ${PRESETS['fade-up'].duration} |`);
    expect(row).toContain(`\`${PRESETS['fade-up'].easing}\``);
  });

  it('метки data: заменены, страница в оглавлении llms.txt', () => {
    expect(files['motion.md']).not.toContain('<!-- data:');
    expect(files['llms.txt']).toContain('- [Анимации](motion.md):');
  });

  it('прямо сказано: data-animate не играет при выключенном «Появлении секций»', () => {
    expect(files['motion.md']).toContain('choice-motion-reveal');
    expect(files['motion.md']).toContain('«Появление секций»');
    expect(files['motion.md']).toContain('по умолчанию `off`');
  });

  it('script.md и styles.md ссылаются на страницу', () => {
    expect(files['script.md']).toContain('(motion.md#ctxanimate)');
    expect(files['styles.md']).toContain('(motion.md');
  });
});
