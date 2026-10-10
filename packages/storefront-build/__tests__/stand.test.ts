import { panelForTheme, parsePanel, type TokenEdits } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import { PREVIEW_AGENT } from '../src/preview-agent';
import { previewTokens, standLocals, type StandInputs } from '../src/stand';
import { novaTokens } from './support-theme';

// Стенд темы в превью (design.md блока 8): данные стенда — из ревизии мерчанта, пустое и неподходящее его не ломает.
const theme = { tokens: novaTokens, panel: panelForTheme(parsePanel(panelJson, novaTokens.dictionary), undefined) };
const SITE = { id: '00000000-0000-4000-8000-000000000001', name: 'Шарфы', publicUrl: 'scarf.dev.merfy.ru' };

const inputsOf = (revision: StandInputs['revision'], site: Partial<StandInputs['site']> = {}): StandInputs => ({
  site: { ...SITE, ...site },
  theme: { id: 'nova', version: '0.0.3' },
  env: { apiUrl: 'https://gateway.dev.merfy.ru/api' },
  revision,
});

const GREEN: TokenEdits = { schemes: { 'scheme-1': { primary: '#16a34a' } }, root: { 'choice-card-style': 'card' } };

describe('standLocals', () => {
  it('ревизия без правок: умолчания темы и настроек, режим preview, слушатель превью', () => {
    const locals = standLocals(inputsOf({ tokens: undefined, settings: undefined }), theme);
    expect(locals.attributes).toEqual({
      'data-card-style': 'standard',
      'data-card-align': 'left',
      'data-motion-reveal': 'off',
      'data-motion-hover': 'none',
    });
    expect(locals.settings).toMatchObject({ 'cart-type': 'drawer', 'cookie-banner-enabled': true, 'logo-image': '' });
    expect(Object.keys(locals.settings)).toHaveLength(14);
    expect(locals.config).toEqual({
      'shop.name': 'Шарфы',
      mode: 'preview',
      'theme.version': '0.0.3',
      'page.id': 'theme-stand',
    });
    expect(locals.head.configHtml).toContain('"url":"https://scarf.dev.merfy.ru"');
    expect(locals.head.previewScript).toBe(PREVIEW_AGENT);
    expect(locals.schemes).toEqual(['scheme-1', 'scheme-2']);
    expect(locals.problems).toEqual([]);
  });

  it('правки токенов и настроек из ревизии — в CSS, атрибутах и настройках', () => {
    const locals = standLocals(inputsOf({ tokens: GREEN, settings: { 'cart-type': 'page' } }), theme);
    expect(locals.head.tokensCss).toContain('#16a34a');
    expect(locals.attributes['data-card-style']).toBe('card');
    expect(locals.settings['cart-type']).toBe('page');
  });

  it('неподходящие правки — списком, стенд рисуется без них', () => {
    const revision = { tokens: { root: { 'radius-button': 'круглые' } }, settings: { 'cart-type': 'modal', gone: 1 } };
    const locals = standLocals(inputsOf(revision), theme);
    expect(locals.problems).toEqual([
      expect.stringMatching(/^tokens\.root\.radius-button: /),
      'settings.cart-type: нужно drawer или page',
      'settings.gone: такой настройки нет в панели',
    ]);
    expect(locals.settings['cart-type']).toBe('drawer');
  });

  it('имя стёрто — адрес магазина; нет и адреса — «Магазин»', () => {
    const empty = { tokens: {}, settings: {} };
    expect(standLocals(inputsOf(empty, { name: '  ' }), theme).shop.name).toBe('scarf.dev.merfy.ru');
    expect(standLocals(inputsOf(empty, { name: '', publicUrl: null }), theme).shop.name).toBe('Магазин');
    expect(standLocals(inputsOf(empty, { publicUrl: '' }), theme).head.configHtml).toContain('"url":null');
  });
});

describe('previewTokens', () => {
  it('CSS и атрибуты — по правкам, без правок — как у темы', () => {
    expect(previewTokens(novaTokens, GREEN).attributes['data-card-style']).toBe('card');
    expect(previewTokens(novaTokens, GREEN).css).toContain('#16a34a');
    expect(previewTokens(novaTokens, {}).css).not.toContain('#16a34a');
  });
});
