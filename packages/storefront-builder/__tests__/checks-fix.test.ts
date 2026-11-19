// Кто чинит находку (`fix`): значение по месту проверки, одна таблица `FIX_BY_PLACE`; проверка может задать своё;
// в секции платформы (с ролью, `data-role`) то, что чинил бы агент, — дело платформы.
import { describe, expect, it } from 'vitest';
import {
  FIX_BY_PLACE,
  FIX_ON_PLATFORM_SECTION,
  grouped,
  onPlatformSections,
  type CheckFinding,
  type CheckPlace,
  type CheckFix,
  type FindingDraft,
} from '../src/checks/finding';
import { platformSections } from '../src/checks/html/platform';

const draft = (place: CheckPlace, patch: Partial<FindingDraft> = {}): FindingDraft => ({
  place,
  check: 'demo',
  rule: 'demo-rule',
  level: 'warning',
  section: 'hero-1',
  where: 'h2',
  text: 'что не так · как починить',
  ...patch,
});

describe('fix по месту проверки', () => {
  const expected: Array<[CheckPlace, CheckFix]> = [
    ['code', 'silent'],
    ['html', 'silent'],
    ['browser', 'silent'],
    ['audit', 'silent'],
    ['shop', 'ask'],
    ['release', 'platform'],
  ];

  it.each(expected)('место %s — %s', (place, fix) => {
    expect(FIX_BY_PLACE[place]).toBe(fix);
    expect(grouped([draft(place)])[0]?.fix).toBe(fix);
  });

  it('таблица покрывает все места проверок', () => {
    expect(Object.keys(FIX_BY_PLACE).sort()).toEqual(expected.map(([place]) => place).sort());
  });

  it('проверка может переопределить значение своей находки', () => {
    const [found] = grouped([draft('browser', { fix: 'ask' })]);
    expect(found?.fix).toBe('ask');
  });

  it('находки с разным fix в одной секции не склеиваются', () => {
    const found = grouped([draft('browser'), draft('browser', { fix: 'ask' }), draft('browser')]);
    expect(found.map((entry) => [entry.fix, entry.count])).toEqual([
      ['silent', 2],
      ['ask', 1],
    ]);
  });
});

const PAGE = `<body>
<merfy-section data-section="shop:hero" data-section-id="hero-1" class="py-section"><h1>Шарфы</h1></merfy-section>
<merfy-section data-section="shop:cart-drawer" data-section-id="drawer-1" data-role="cart-drawer"></merfy-section>
<merfy-section data-section="shop:cookie-banner" data-section-id="banner-1" data-role="cookie-banner" data-overlay hidden class="x"></merfy-section>
<merfy-section data-section="shop:faq" data-section-id="faq-1" data-note="x data-role=y"></merfy-section>
</body>`;

describe('секции платформы на странице', () => {
  it('платформенные — секции с ролью на обёртке, остальные нет', () => {
    expect([...platformSections(PAGE)].sort()).toEqual(['banner-1', 'drawer-1']);
  });

  it('роль не в обёртке секции и страница без секций — не платформа', () => {
    expect(platformSections('<p data-role="x">текст</p>').size).toBe(0);
    expect(platformSections('').size).toBe(0);
  });
});

describe('fix в секциях платформы', () => {
  const found = (patch: Partial<CheckFinding>): CheckFinding => ({
    place: 'browser',
    check: 'demo',
    rule: 'demo-rule',
    level: 'warning',
    section: 'hero-1',
    where: 'h2',
    text: 'что не так · как починить',
    count: 1,
    fix: 'silent',
    ...patch,
  });
  const platform = new Set(['drawer-1']);

  it('что чинил бы агент молча, в секции платформы — platform', () => {
    const [mine, theirs] = onPlatformSections([found({ section: 'drawer-1' }), found({ section: 'hero-1' })], platform);
    expect([mine?.fix, theirs?.fix]).toEqual(['platform', 'silent']);
  });

  it('данные магазина (ask) остаются вопросом мерчанту, находка вне секций не трогается', () => {
    const [asked, outside] = onPlatformSections(
      [found({ section: 'drawer-1', fix: 'ask' }), found({ section: null })],
      platform,
    );
    expect([asked?.fix, outside?.fix]).toEqual(['ask', 'silent']);
  });

  it('таблица покрывает все значения fix', () => {
    expect(Object.keys(FIX_ON_PLATFORM_SECTION).sort()).toEqual(['ask', 'platform', 'silent']);
  });
});
