import { escapeScriptJson } from '@merfy/storefront-config';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_INPUT,
  INPUT_PARSE_FAILED,
  SECTION_INPUT_ATTRIBUTE,
  SECTION_INPUT_MAX_BYTES,
  readSectionInput,
} from '../src/core/input';

// Тег входных данных (design.md блока 5, раздел 3.5) — договор со сборкой магазина. Сборка (часть 5б) пишет тег ровно
// так, как writtenTag: JSON.stringify и escapeScriptJson из @merfy/storefront-config.
const writtenTag = (input: unknown): string =>
  `<script type="application/json" ${SECTION_INPUT_ATTRIBUTE}>${escapeScriptJson(JSON.stringify(input))}</script>`;

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const INPUT = {
  settings: { title: `Подберите шарф </script><b>к пальто</b>${LINE_SEPARATOR}` },
  blocks: [
    {
      id: 'scarf-1',
      type: 'scarf',
      settings: { name: 'Кашемировый шарф', 'goes-with': 'grey black', 'product-id': 'p12' },
    },
  ],
  data: {},
};

function section(html: string): HTMLElement {
  const element = document.createElement('merfy-section');
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

function errorOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('тег входных данных', () => {
  it('сборка пишет — ядро читает тот же объект: «</script>» и U+2028 в строках тег не ломают', () => {
    expect(readSectionInput(section(`<p>Подбор</p>${writtenTag(INPUT)}`))).toEqual(INPUT);
  });

  it('прочитанное глубоко заморожено', () => {
    const input = readSectionInput(section(writtenTag(INPUT)));
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.settings)).toBe(true);
    expect(Object.isFrozen(input.blocks)).toBe(true);
    expect(Object.isFrozen(input.blocks[0]?.settings)).toBe(true);
  });

  it('тега нет — у секции только разметка SDK: пустые входные данные', () => {
    expect(readSectionInput(section('<button data-action="cart.add">В корзину</button>'))).toBe(EMPTY_INPUT);
    expect(EMPTY_INPUT).toEqual({ settings: {}, blocks: [], data: {} });
    expect(Object.isFrozen(EMPTY_INPUT.settings)).toBe(true);
  });

  it('тег глубже прямого потомка обёртки — не входные данные этой секции', () => {
    expect(readSectionInput(section(`<div>${writtenTag(INPUT)}</div>`))).toBe(EMPTY_INPUT);
  });

  it.each([
    ['не JSON', '{"settings":'],
    ['не объект', '[]'],
    ['нет blocks', '{"settings":{},"data":{}}'],
    ['блок без id', '{"settings":{},"blocks":[{"type":"scarf","settings":{}}],"data":{}}'],
    ['settings — массив', '{"settings":[],"blocks":[],"data":{}}'],
    ['data — строка', '{"settings":{},"blocks":[],"data":"x"}'],
  ])('%s — ShellError input-invalid с текстом для события сбоя', (_case, json) => {
    const element = section(`<script type="application/json" ${SECTION_INPUT_ATTRIBUTE}>${json}</script>`);
    expect(errorOf(() => readSectionInput(element))).toMatchObject({
      code: 'input-invalid',
      message: INPUT_PARSE_FAILED,
    });
    expect(INPUT_PARSE_FAILED).toBe('не удалось разобрать входные данные');
  });

  it('предел — 32 КБ JSON одного экземпляра: с ним сверяет сборка (input-too-large)', () => {
    expect(SECTION_INPUT_MAX_BYTES).toBe(32 * 1024);
  });
});
