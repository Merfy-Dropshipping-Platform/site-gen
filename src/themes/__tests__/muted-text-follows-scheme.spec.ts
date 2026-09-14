/**
 * Приглушённый текст обязан следовать цветовой схеме, а не быть серым.
 *
 * Жалоба тестировщика 14.09: «во всех секциях вместо используемого цвета для
 * текста применяется Серый цвет, хотя настроены совсем другие». Причина была в
 * том, что `--color-muted` приезжал готовым из `theme.json` — у всех схем всех
 * пяти тем он равнялся `153 153 153`, — а поля для него в редакторе схемы нет
 * и не будет (состав настроек канон). Значит мерчант физически не мог его
 * изменить: подзаголовки секций, описания, телефон в подвале оставались серыми
 * при любом выбранном цвете текста.
 *
 * Токеном покрашен текст в 203 местах пяти тем плюс theme-base, поэтому чиним
 * не места, а сам токен: он считается как 60 % текста схемы + 40 % её фона —
 * та же пропорция, которой уже приглушены описание и старая цена в «Товаре».
 *
 * Рамки (`border-[rgb(var(--color-muted))]`, 14 мест) и плейсхолдеры (6 мест)
 * используют тот же токен законно и едут за схемой заодно — это желаемое
 * поведение, а не побочный эффект.
 */
import { buildTokensCss } from '../tokens-css';

type Scheme = Record<string, unknown>;

function scheme(id: string, text: string, background: string): Scheme {
  return {
    id,
    name: id,
    background,
    surfaceBg: background,
    heading: text,
    text,
    // Именно это значение раньше и приезжало во все схемы всех тем.
    muted: '#999999',
    primaryButton: { background: '#000000', text: '#ffffff', border: '#000000' },
    secondaryButton: { background, text, border: text },
  };
}

function mutedOf(css: string, id: string): string | null {
  const n = id.replace('scheme-', '');
  const rule = new RegExp(`\\.color-scheme-${n}\\s*\\{([^}]*)\\}`).exec(css);
  if (!rule) return null;
  return /--color-muted:\s*([^;]+)/.exec(rule[1])?.[1]?.trim() ?? null;
}

const SCHEMES = [
  { id: 'scheme-1', text: '#121212', bg: '#ffffff', подпись: 'светлая' },
  { id: 'scheme-2', text: '#1A1A1A', bg: '#71C0FF', подпись: 'фон схемы тестировщика' },
  { id: 'scheme-3', text: '#ffffff', bg: '#0A0A0A', подпись: 'тёмная' },
  { id: 'scheme-4', text: '#FF00AA', bg: '#FFFFE0', подпись: 'контрастная' },
];

describe('приглушённый текст следует схеме, а не фиксированному серому', () => {
  const css = buildTokensCss(
    { colorSchemes: SCHEMES.map((s) => scheme(s.id, s.text, s.bg)) } as never,
    null,
  );

  it.each(SCHEMES)('$подпись: muted не равен прежнему серому 153 153 153', (s) => {
    expect(mutedOf(css, s.id)).not.toBe('153 153 153');
  });

  it('разные схемы дают разный приглушённый — значит он считается, а не вшит', () => {
    const values = SCHEMES.map((s) => mutedOf(css, s.id));
    expect(new Set(values).size).toBe(SCHEMES.length);
  });

  it.each(SCHEMES)('$подпись: muted лежит между текстом и фоном схемы', (s) => {
    const toTriple = (hex: string) => {
      const h = hex.replace('#', '');
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    };
    const muted = (mutedOf(css, s.id) ?? '').split(/\s+/).map(Number);
    const text = toTriple(s.text);
    const bg = toTriple(s.bg);
    expect(muted).toHaveLength(3);
    muted.forEach((v, i) => {
      const lo = Math.min(text[i], bg[i]);
      const hi = Math.max(text[i], bg[i]);
      expect(v).toBeGreaterThanOrEqual(lo);
      expect(v).toBeLessThanOrEqual(hi);
    });
  });

  it('ближе к тексту, чем к фону — текст остаётся читаемым', () => {
    const s = SCHEMES[0];
    const muted = (mutedOf(css, s.id) ?? '').split(/\s+/).map(Number);
    // текст #121212 = 18, фон #ffffff = 255; 60 % текста → около 113
    expect(muted[0]).toBeLessThan((18 + 255) / 2);
  });
});
