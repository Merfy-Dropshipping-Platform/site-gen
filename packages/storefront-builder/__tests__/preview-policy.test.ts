import { describe, expect, it } from 'vitest';
import { PREVIEW_POLICY_META, withPreviewPolicy } from '../src/preview-policy';

// Политика превью новой темы (блок 2 «Секций и SDK», часть 2б): form-action 'none' — первым тегом <head>.
describe('политика превью', () => {
  it('тег политики — form-action none', () => {
    expect(PREVIEW_POLICY_META).toBe(`<meta http-equiv="Content-Security-Policy" content="form-action 'none'">`);
  });

  it('первым в <head>, до остального содержимого; <head> с атрибутами — тоже', () => {
    const page = '<html lang="ru"><head><title>Шарфы</title></head><body><form action="/x"></form></body></html>';
    expect(withPreviewPolicy(page)).toBe(
      `<html lang="ru"><head>${PREVIEW_POLICY_META}<title>Шарфы</title></head><body><form action="/x"></form></body></html>`,
    );
    expect(withPreviewPolicy('<html><HEAD data-x="1"><title>Шарфы</title></HEAD></html>')).toBe(
      `<html><HEAD data-x="1">${PREVIEW_POLICY_META}<title>Шарфы</title></HEAD></html>`,
    );
  });

  it('<header> — не <head>: политика встаёт в настоящий <head>', () => {
    const page = '<html><head></head><body><header>меню</header></body></html>';
    expect(withPreviewPolicy(page)).toBe(
      `<html><head>${PREVIEW_POLICY_META}</head><body><header>меню</header></body></html>`,
    );
  });

  it('без <head> — ошибка, а не превью без политики', () => {
    expect(() => withPreviewPolicy('<html><body></body></html>')).toThrow('превью без <head>');
  });
});
