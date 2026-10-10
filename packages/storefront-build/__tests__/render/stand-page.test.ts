import { fileURLToPath } from 'node:url';
import {
  classesOf,
  panelForTheme,
  parsePanel,
  settingFields,
  tokenFields,
  type SettingSpec,
  type SettingValue,
} from '@merfy/tokens';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import panelJson from '../../../theme-contract/panel/theme-panel.json';
import { startRenderer, type Renderer } from '../../src/renderer';
import { standLocals, type StandInputs } from '../../src/stand';
import { buildRendererBundle } from '../../src/theme-build';
import { novaTokens } from '../support-theme';

// Стенд темы в превью на настоящем рисовальщике nova (design.md блока 8, П8-1 А, П8-4 Б): правки мерчанта видны, пустое
// не ломает, и каждое из 44 полей «Настроек темы» меняет хотя бы один образец.
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../../../themes/nova/dist-renderer-test/', import.meta.url));
const panel = panelForTheme(parsePanel(panelJson, novaTokens.dictionary), undefined);
const theme = { tokens: novaTokens, panel };

const inputsOf = (tokens: unknown, settings: unknown): StandInputs => ({
  site: { id: '00000000-0000-4000-8000-000000000001', name: 'Шарфы', publicUrl: 'scarf.dev.merfy.ru' },
  theme: { id: 'nova', version: '0.0.3' },
  env: { apiUrl: 'https://gateway.dev.merfy.ru/api' },
  revision: { tokens, settings },
});

// Классы страницы без вариантов: «card-style-card:bg-card» → «bg-card»; варианты — отдельно, с двоеточием.
const classesIn = (html: string): string[] =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)).filter(Boolean);

// Значение настройки не по умолчанию: оно обязано поменять образец.
function otherValue(spec: SettingSpec): SettingValue {
  if (spec.kind === 'toggle') return !spec.default;
  if (spec.kind === 'select') return spec.options.find((option) => option.value !== spec.default)?.value ?? '';
  if (spec.kind === 'image' || spec.kind === 'url') return 'https://minio.merfy.ru/merfy-sites/proverka.png';
  return 'Проверка образца';
}

describe('стенд темы в превью на рисовальщике nova', () => {
  let renderer: Renderer;
  let plain: string;

  beforeAll(async () => {
    const bundle = await buildRendererBundle(NOVA_DIR, OUT_DIR);
    renderer = await startRenderer(bundle.serverEntry);
    plain = await renderer.renderStand(standLocals(inputsOf({}, {}), theme));
  });

  afterAll(async () => {
    await renderer.close();
  });

  it('разделы стенда, атрибуты выборов у <html>, слушатель превью и конфиг в mode: preview', () => {
    const ids = [...plain.matchAll(/data-stand="([a-z-]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual([
      'logo',
      'schemes',
      'type-scale',
      'radii-spacing',
      'shadows',
      'controls',
      'price',
      'product-card',
      'socials',
      'cart',
      'cookie-banner',
      'config',
    ]);
    expect(plain).toContain('data-card-style="standard"');
    expect(plain).toContain("new URL('preview/tokens', location.href)");
    expect(plain).toContain('<dd data-config-field="mode">preview</dd>');
    expect(plain).toContain('<meta name="robots" content="noindex">');
  });

  it('правка цвета и стиля карточки — в CSS токенов и у <html>', async () => {
    const tokens = { schemes: { 'scheme-1': { primary: '#16a34a' } }, root: { 'choice-card-style': 'card' } };
    const html = await renderer.renderStand(standLocals(inputsOf(tokens, {}), theme));
    expect(html).toContain('--primary: #16a34a;');
    expect(html).toContain('data-card-style="card"');
  });

  it('пустое не ломает: нет картинки логотипа — имя магазина, ссылок нет, баннер выключен — образца нет', async () => {
    expect(plain).toContain('<span class="text-xl font-heading weight-heading text-heading">Шарфы</span>');
    expect(plain).toContain('Ссылок нет');
    const off = await renderer.renderStand(standLocals(inputsOf({}, { 'cookie-banner-enabled': false }), theme));
    expect(off).not.toContain('data-cookie-banner=');
    expect(plain).toContain('data-cookie-banner="bottom-left"');
  });

  it('неподходящие правки — разделом «Правки не подошли теме», стенд нарисован', async () => {
    const html = await renderer.renderStand(standLocals(inputsOf({}, { 'cart-type': 'modal' }), theme));
    expect(html).toContain('data-stand="problems"');
    expect(html).toContain('settings.cart-type: нужно drawer или page');
    expect(html).toContain('data-cart="drawer"');
  });

  it('каждое поле токена — класс токена на стенде (30 полей)', () => {
    const classes = classesIn(plain);
    const utilities = new Set(classes.map((name) => name.split(':').at(-1) ?? ''));
    const missing = tokenFields(panel).filter((field) => {
      const own = classesOf(field.token, novaTokens.dictionary.tokens[field.token]);
      return !own.some((name) => utilities.has(name) || classes.some((candidate) => candidate.startsWith(name)));
    });
    expect(tokenFields(panel)).toHaveLength(30);
    expect(missing.map((field) => field.id)).toEqual([]);
  });

  it('каждая настройка не про вид меняет стенд (14 полей)', async () => {
    const fields = settingFields(panel);
    const changed = await Promise.all(
      fields.map(async (field) => {
        const settings = { [field.id]: otherValue(field.setting) };
        return (await renderer.renderStand(standLocals(inputsOf({}, settings), theme))) !== plain;
      }),
    );
    expect(fields).toHaveLength(14);
    expect(fields.filter((_, index) => !changed[index]).map((field) => field.id)).toEqual([]);
  });
});
