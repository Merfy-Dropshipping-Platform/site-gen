import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { migrateRevisionData } from '../revision-migrations';
import { PAGE_REGISTRY, getSystemPageRoute, isVerbatimRoute } from '../../themes/page-registry';

/**
 * Пункт 14 тестировщика: «Добавить в верхнее меню пункт "Профиль" для настройки
 * внешнего вида данной страницы».
 *
 * Факты замера (2026-09-13):
 *  - страница покупателя СУЩЕСТВУЕТ на витрине во всех пяти темах:
 *    `themes/<t>/src/pages/account/profile.astro`, live отдаёт 200;
 *  - превью конструктора её УЖЕ умеет показывать: `?page=account/profile`
 *    → 200, «Основные данные», шапка мерчанта (проверено на vanilla QA:
 *    aria-label «Vanilla Pilot», ссылки `/c/mebel`);
 *  - Puck-блоков у неё НЕТ: маршрут verbatim (`account` в VERBATIM_PREFIXES),
 *    тело страницы приходит из собранной темы.
 *
 * Отсюда объём: пункт меню заводится ТЕМ ЖЕ механизмом, что остальные страницы
 * (запись реестра + страница в манифесте темы + запись в `pages[]` ревизии), а
 * редактируемое содержимое страницы — РОВНО шапка и подвал, потому что только
 * они реально доезжают на verbatim-страницу (инъекция хрома). Фиктивной секции
 * «Страница» здесь быть не должно: её правки ни на что не влияют.
 */
describe('страница «Профиль» в конструкторе', () => {
  it('заведена в реестре как verbatim-страница с хромом', () => {
    const entry = PAGE_REGISTRY.find((e) => e.id === 'page-profile');
    expect(entry).toBeDefined();
    expect(entry!.route).toBe('account/profile');
    expect(entry!.kind).toBe('verbatim');
    expect(entry!.chrome).toBe('full');
  });

  it('маршрут остаётся verbatim (тело страницы — из темы, не из Puck)', () => {
    expect(isVerbatimRoute('account/profile')).toBe(true);
  });

  it('резолвится по id в карте маршрутов превью', () => {
    expect(getSystemPageRoute('page-profile')).toBe('account/profile');
  });

  it('добавляется в pages[] существующей ревизии', () => {
    const out = migrateRevisionData(
      { pages: [{ id: 'home', name: 'Главная', slug: '/' }], pagesData: { home: { content: [] } } },
      'rose',
    ) as { pages: Array<{ id: string; slug: string; role?: string }> };
    const page = out.pages.find((p) => p.id === 'page-profile');
    expect(page).toBeDefined();
    expect(page!.slug).toBe('/account/profile');
    expect(page!.role).toBe('system');
  });

  it('содержимое — только шапка и подвал (никаких мёртвых секций)', () => {
    const homeHeader = { type: 'Header', props: { id: 'Header-home', siteTitle: 'Магазин' } };
    const homeFooter = { type: 'Footer', props: { id: 'Footer-home' } };
    const out = migrateRevisionData(
      {
        pages: [{ id: 'home', name: 'Главная', slug: '/' }],
        pagesData: { home: { content: [homeHeader, { type: 'Hero', props: {} }, homeFooter] } },
      },
      'rose',
    ) as { pagesData: Record<string, { content: Array<{ type: string; props: Record<string, unknown> }> }> };

    const content = out.pagesData['page-profile'].content;
    expect(content.map((b) => b.type)).toEqual(['Header', 'Footer']);
    // Шапка — та же, что на главной (пункт 13), но со своим id.
    expect(content[0].props.siteTitle).toBe('Магазин');
    expect(content[0].props.id).not.toBe('Header-home');
  });

  it('идемпотентна — второй прогон не плодит дублей', () => {
    const first = migrateRevisionData(
      { pages: [{ id: 'home', name: 'Главная', slug: '/' }], pagesData: { home: { content: [] } } },
      'rose',
    );
    const second = migrateRevisionData(JSON.parse(JSON.stringify(first)), 'rose') as {
      pages: Array<{ id: string }>;
    };
    expect(second.pages.filter((p) => p.id === 'page-profile')).toHaveLength(1);
  });

  it('страница профиля есть в манифесте каждой темы', () => {
    for (const theme of ['rose', 'vanilla', 'flux', 'satin', 'bloom']) {
      const mf = join(__dirname, '..', '..', '..', 'packages', `theme-${theme}`, 'theme.json');
      const pages = JSON.parse(readFileSync(mf, 'utf8')).pages as Array<{ id: string; slug: string; contentFile?: string }>;
      const entry = pages.find((p) => p.id === 'page-profile');
      expect([theme, entry]).toEqual([theme, expect.any(Object)]);
      expect(entry!.slug).toBe('/account/profile');
      const seed = join(__dirname, '..', '..', '..', 'packages', `theme-${theme}`, entry!.contentFile!);
      expect([theme, existsSync(seed)]).toEqual([theme, true]);
    }
  });

  it('витрина реально отдаёт такую страницу во всех пяти темах', () => {
    for (const theme of ['rose', 'vanilla', 'flux', 'satin', 'bloom']) {
      const astro = join(__dirname, '..', '..', '..', 'themes', theme, 'src', 'pages', 'account', 'profile.astro');
      expect([theme, existsSync(astro)]).toEqual([theme, true]);
    }
  });
});
