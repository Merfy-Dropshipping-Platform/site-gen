import { resolveBlockProps } from '../resolve-props';
import { EMPTY_CATALOG } from '../catalog';

/**
 * «Стёрто» и «не задано» — разные состояния заголовка (владелец 26.09).
 * Стёртый текст доезжает до порта пустой строкой, и секция рисует пустоту;
 * конверт без текста (мерчант сменил только размер) остаётся «не задан», и
 * порт вправе показать заглушку темы.
 */
describe('resolveBlockProps: стёртый заголовок vs не заданный', () => {
  const resolve = (props: Record<string, unknown>) =>
    resolveBlockProps('Hero', props, EMPTY_CATALOG).props;

  it('стёртый текст конверта остаётся пустой строкой', () => {
    expect(resolve({ heading: { text: '', size: 'large' } }).heading).toEqual({ text: '', size: 'large' });
  });

  it('текст из пробелов считается стёртым', () => {
    expect(resolve({ heading: { text: '   ' } }).heading).toEqual({ text: '' });
  });

  it('конверт без текста не превращается в стёртый', () => {
    expect(resolve({ heading: { size: 'small' } }).heading).toEqual({ size: 'small' });
  });

  it('стёртая строка остаётся пустой строкой', () => {
    expect(resolve({ heading: '' }).heading).toBe('');
  });
});
