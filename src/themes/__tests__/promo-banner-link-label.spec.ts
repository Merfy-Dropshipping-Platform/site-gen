import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * Подпись ссылки «Панели объявлений» доезжает до витрины даже без выбранной
 * страницы.
 *
 * НАЙДЕНО АУДИТОМ НАСТРОЕК 22.09, не тестером. Поле «Ссылка» — конверт
 * {text, href} пикера страниц. Мерчант ввёл подпись и страницу не выбрал —
 * остаётся {text}, ровно та форма, которую общая нормализация схлопывает в
 * СТРОКУ (page-blocks: правило «{text, size?, enabled?, alignment?} → text»).
 * Дальше темы принимали подпись за адрес.
 *
 * Замер до починки на `link: { text: 'МЕТКА' }`:
 *   rose     подпись «Перейти», адрес /МЕТКА
 *   flux     подпись «Перейти», адрес /МЕТКА
 *   satin    подпись «Текст»,   адрес /МЕТКА
 *   bloom    ссылки нет вовсе
 *   vanilla  ссылки нет вовсе
 * То есть сломаны были ВСЕ ПЯТЬ, каждая по-своему — поэтому проверка гоняет
 * все темы, а не ту, где заметили.
 *
 * Сторожим поведение, а не текст нормализатора: подпись обязана оказаться
 * ВНУТРИ <a>, а не в его адресе.
 */

const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const КАТАЛОГ = { products: [], collections: [], publications: [] };

function ссылка(
  тема: string,
  link: unknown,
): { подпись: string | null; адрес: string | null } {
  const [строка] = renderSections(тема, [
    {
      block: "PromoBanner",
      props: {
        id: "PromoBanner-1",
        colorScheme: "scheme-1",
        text: "Текст объявления",
        link,
      },
      catalog: КАТАЛОГ,
    },
  ]);
  const html = (строка?.html ?? "").replace(/\s+/g, " ");
  const подпись = html.match(/<a[^>]*>([^<]*)<\/a>/);
  const адрес = html.match(/<a[^>]*href="([^"]*)"/);
  return {
    подпись: подпись ? подпись[1].trim() : null,
    адрес: адрес ? адрес[1] : null,
  };
}

describe("подпись ссылки промо-баннера", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: подпись без выбранной страницы попадает в текст ссылки, а не в адрес`, () => {
      const { подпись, адрес } = ссылка(тема, { text: "МЕТКА" });
      expect(подпись).toBe("МЕТКА");
      expect(адрес).not.toBeNull();
      expect(адрес).not.toContain("МЕТКА");
    });

    it(`${тема}: подпись и выбранная страница остаются каждая на своём месте`, () => {
      const { подпись, адрес } = ссылка(тема, {
        text: "МЕТКА",
        href: "/about",
      });
      expect(подпись).toBe("МЕТКА");
      expect(адрес).toBe("/about");
    });

    it(`${тема}: старая плоская форма linkText по-прежнему работает`, () => {
      const [строка] = renderSections(тема, [
        {
          block: "PromoBanner",
          props: {
            id: "PromoBanner-1",
            colorScheme: "scheme-1",
            text: "Текст объявления",
            linkText: "СТАРАЯ",
            linkUrl: "/contacts",
          },
          catalog: КАТАЛОГ,
        },
      ]);
      const html = (строка?.html ?? "").replace(/\s+/g, " ");
      expect(html).toContain("СТАРАЯ");
      expect(html).toContain('href="/contacts"');
    });
  }
});
