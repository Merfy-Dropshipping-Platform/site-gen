import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/color';
import { HOVER_SHIFT, applyRule, contrastColor, hoverColor, ruleText } from '../src/derive';
import { platformDictionary } from '../src/dictionary';

const scheme1 = { background: '#ffffff', foreground: '#111111', primary: '#111111', 'primary-foreground': '#ffffff' };

describe('наведение', () => {
  it('сдвиг — 12 %, как у нынешних тем', () => {
    expect(HOVER_SHIFT).toBe(0.12);
  });

  it('тёмную кнопку светлит, светлую затемняет', () => {
    expect(hoverColor('#111111', '#ffffff')).toBe('#2e2e2e');
    expect(hoverColor('#ffffff', '#000000')).toBe('#e0e0e0');
    expect(hoverColor('#f1f1f1', '#111111')).toBe('#d4d4d4');
  });

  it('розовая кнопка с белой надписью темнеет: в светлую сторону надпись читалась бы хуже', () => {
    expect(hoverColor('#e91e8c', '#ffffff')).toBe('#cd1a7b');
    expect(contrastRatio('#ffffff', '#cd1a7b').toFixed(2)).toBe('5.21');
  });
});

describe('контраст', () => {
  it('выбирает белый или чёрный — что читается лучше', () => {
    expect(contrastColor('#dc2626')).toBe('#ffffff');
    expect(contrastColor('#facc15')).toBe('#000000');
    expect(contrastColor('#111111')).toBe('#ffffff');
  });
});

describe('правила словаря', () => {
  it('alias берёт значение источника', () => {
    expect(applyRule({ rule: 'alias', from: 'radius-button' }, { 'radius-button': 8 })).toBe(8);
  });

  it('mix: 12 % текста в фоне, 6 % и 60 %', () => {
    expect(applyRule({ rule: 'mix', from: ['foreground', 'background'], weight: 0.12 }, scheme1)).toBe('#e2e2e2');
    expect(applyRule({ rule: 'mix', from: ['foreground', 'background'], weight: 0.06 }, scheme1)).toBe('#f1f1f1');
    expect(applyRule({ rule: 'mix', from: ['foreground', 'background'], weight: 0.6 }, scheme1)).toBe('#707070');
  });

  it('hover и contrast считают из цветов словаря', () => {
    expect(applyRule({ rule: 'hover', from: 'primary', text: 'primary-foreground' }, scheme1)).toBe('#2e2e2e');
    expect(applyRule({ rule: 'contrast', from: 'primary' }, scheme1)).toBe('#ffffff');
  });

  it('без источника правило ничего не считает', () => {
    expect(applyRule({ rule: 'mix', from: ['foreground', 'nope'], weight: 0.5 }, scheme1)).toBeUndefined();
    expect(applyRule({ rule: 'contrast', from: 'nope' }, scheme1)).toBeUndefined();
  });
});

describe('правило словами', () => {
  it.each([
    ['background', 'задаёт тема'],
    ['card', 'как background'],
    ['secondary', 'смесь: 6 % foreground в background'],
    ['primary-hover', 'наведение от primary'],
    ['primary-foreground', 'белый или чёрный к primary'],
    ['border-width-input', 'по умолчанию 1 px'],
    ['shadow-popover', 'по умолчанию 0 8 24 0, 12 %'],
    ['choice-card-style', 'по умолчанию standard'],
    ['scheme-card', 'не задана — как у родителя'],
  ])('%s — «%s»', (name, text) => {
    expect(ruleText(platformDictionary, name)).toBe(text);
  });

  it('оформляет имена и значения, если попросить', () => {
    const code = (text: string) => `\`${text}\``;
    expect(ruleText(platformDictionary, 'primary-hover', code)).toBe('наведение от `primary`');
    expect(ruleText(platformDictionary, 'choice-card-style', code)).toBe('по умолчанию `standard`');
  });
});
