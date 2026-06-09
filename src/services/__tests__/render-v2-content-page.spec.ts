import { PreviewService } from '../preview.service';

/**
 * Конструктор v2 — Фаза 2 (слайсинг). renderV2ContentPage:
 *  - грузит шелл собранной страницы темы (tryLoadBuiltThemeHtml),
 *  - Container-рендерит блоки ревизии (через стаб-контейнер),
 *  - пересаживает их в шелл через composeV2Page (head + хвост body дословно),
 *  - инжектит iframe-агент конструктора перед </body>,
 *  - возвращает null когда шелла нет → зовущий фоллбечит на блоб-путь.
 *
 * Container/resolver стабятся как в preview.service.spec.ts — ts-jest не
 * парсит .astro. Шелл подменяем спаем на tryLoadBuiltThemeHtml, чтобы тест
 * не зависел от dist/theme-preview на диске.
 */
describe('renderV2ContentPage', () => {
  it('пересаживает блоки в шелл и инжектит агента; null без шелла', async () => {
    const svc = new PreviewService(
      // containerFactory-стаб: возвращает props.id как маркер блока.
      async () =>
        ({
          renderToString: async (_c: unknown, opts: any) =>
            `<div data-block>${JSON.stringify(opts?.props?.id ?? '')}</div>`,
        }) as any,
      // componentResolver-стаб: любой блок резолвится в пустышку.
      async () => ({}) as any,
    );
    // Шелл с распознаваемой структурой composeV2Page (<body> … </footer>) +
    // хвостом body (tail()) который должен сохраниться дословно.
    jest.spyOn(svc, 'tryLoadBuiltThemeHtml').mockResolvedValue(
      '<html><head><title>T</title></head><body><header>H</header><main>M</main><footer>F</footer><script>tail()</script></body></html>',
    );
    const html = await svc.renderV2ContentPage({
      themeId: 'rose',
      route: '',
      blocks: [
        { type: 'Header', props: { id: 'Header-1' } },
        { type: 'Hero', props: { id: 'Hero-1' } },
        { type: 'Footer', props: { id: 'Footer-1' } },
      ],
    });
    expect(html).not.toBeNull();
    expect(html!).toContain('tail()'); // хвост шелла жив
    expect(html!).toContain('"Hero-1"'); // блок отрендерен стабом
    // Header — header-блок → стоит ДО <main> (composeV2Page кладёт его в шапку).
    expect(html!.indexOf('"Header-1"')).toBeLessThan(html!.indexOf('<main>'));
    expect(html!).toContain('select-block'); // агент инжектирован (фраза из PREVIEW_NAV_AGENT_INLINE)

    // Шелл отсутствует → null (фоллбек на блоб-путь у зовущего).
    jest.spyOn(svc, 'tryLoadBuiltThemeHtml').mockResolvedValue(null);
    expect(
      await svc.renderV2ContentPage({ themeId: 'rose', route: 'x', blocks: [] }),
    ).toBeNull();
  });
});
