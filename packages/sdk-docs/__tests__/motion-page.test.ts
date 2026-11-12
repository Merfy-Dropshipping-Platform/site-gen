import { EASINGS } from '@merfy/shell/behaviors/catalog';
import { PRESETS } from '@merfy/shell/behaviors/presets';
import { ANIMATABLE } from '@merfy/shell/keyframes';
import { beforeAll, describe, expect, it } from 'vitest';
import { docsFiles, type DocsFiles } from '../src/docs';
import { readSources } from '../src/sources';

// motion.md (спека «Анимации», этап 1): таблицы строятся из кода SDK — новый пресет, свойство или кривая попадают в
// справку сами, а страница прямо говорит про выключенное «Появление секций».
let files: DocsFiles;

beforeAll(async () => {
  files = docsFiles(await readSources());
});

describe('motion.md', () => {
  it('каждый пресет, свойство и кривая из кода — строка таблицы', () => {
    const text = files['motion.md'] ?? '';
    for (const name of Object.keys(PRESETS)) expect(text, name).toContain(`| \`${name}\` |`);
    for (const name of ANIMATABLE) expect(text, name).toContain(`| \`${name}\` |`);
    for (const name of Object.keys(EASINGS)) expect(text, name).toContain(`| \`'${name}'\` |`);
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
