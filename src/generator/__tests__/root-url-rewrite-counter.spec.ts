import { ROOT_URL_RE, rewriteRootUrlsToPrefix } from "../theme-build.service";

/**
 * Префикс темы не должен трогать текст, где `/` — разделитель, а не URL.
 *
 * Поймано 15.09: счётчик слайдов satin («2 / 2») приезжал в превью как
 * «2 /__theme/satin/ 2» — тестер прислал скриншот. Регулярка ловила `/`
 * после пробела и считала его корневым URL. Валидный ассет после `/`
 * всегда ведёт к букве, цифре или `_`, но не к пробелу.
 */
describe("префикс темы не ломает текст с дробью", () => {
  const prefix = "/__theme/satin";

  it.each([
    ["счётчик слайдов", "2 / 2"],
    ["счётчик в разметке", "<span>3 / 7</span>"],
    ["дробь в тексте", "скидка 1 / 2 цены"],
    ["диапазон", "40 / 60"],
  ])("%s остаётся как есть", (_name, text) => {
    expect(rewriteRootUrlsToPrefix(text, prefix)).toBe(text);
  });

  it.each([
    ["картинка", '<img src="/img.png">', '<img src="/__theme/satin/img.png">'],
    ["стиль", '<link href="/a.css">', '<link href="/__theme/satin/a.css">'],
    ["css url", "background: url(/bg.png)", "background: url(/__theme/satin/bg.png)"],
  ])("%s по-прежнему переписывается", (_name, src, want) => {
    expect(rewriteRootUrlsToPrefix(src, prefix)).toBe(want);
  });

  it("srcset переписывает оба адреса", () => {
    const out = rewriteRootUrlsToPrefix('srcset="/a.png 1x, /b.png 2x"', prefix);
    expect(out).toContain("/__theme/satin/a.png");
    expect(out).toContain("/__theme/satin/b.png");
  });

  it("self-closing тег не ломается", () => {
    expect(rewriteRootUrlsToPrefix('<path d="M0 0"/>', prefix)).toBe('<path d="M0 0"/>');
  });

  it("контроль: регулярка исключает пробел после слэша", () => {
    expect(ROOT_URL_RE.source).toContain("\\s");
  });
});

/**
 * Префикс ставится ОДИН раз. 23.09: пропсы превью уже несли `/__theme/bloom/…`
 * (page-blocks `rewriteAssetUrl` с publicUrl `/__theme/bloom`), а composeV2Page
 * добавлял второй — картинка «О нас» bloom в конструкторе отдавала 404.
 */
describe("префикс темы ставится один раз", () => {
  const prefix = "/__theme/bloom";

  it("уже переписанный адрес остаётся как есть", () => {
    const once = '<img src="/__theme/bloom/images/about-photo.webp">';
    expect(rewriteRootUrlsToPrefix(once, prefix)).toBe(once);
  });

  it("повторный проход ничего не меняет", () => {
    const once = rewriteRootUrlsToPrefix('<img src="/images/a.webp">', prefix);
    expect(once).toBe('<img src="/__theme/bloom/images/a.webp">');
    expect(rewriteRootUrlsToPrefix(once, prefix)).toBe(once);
  });
});
