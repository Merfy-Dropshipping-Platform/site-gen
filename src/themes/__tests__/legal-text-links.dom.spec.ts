/**
 * @jest-environment jsdom
 *
 * Ссылки на политики продавца в юридической строке «Спасибо за заказ»
 * (OrderConfirmation.legalText) и чекаута (CheckoutForm → CheckoutTerms) —
 * пять тем, НАСТОЯЩИЙ рендер блоков (тот же модуль и та же живая цепочка
 * props, что витрина и превью: render-theme-sections.mjs), НАСТОЯЩИЙ
 * встроенный скрипт из этой разметки (runtime/legal-links.ts строкой).
 *
 * Владелец 28.09: «Размещая заказ, вы соглашаетесь с Условиями обслуживания,
 * Политикой конфиденциальности и Политикой использования файлов cookie» —
 * названия документов ведут на тексты политик продавца.
 *
 * Сторожим:
 *  • tos + privacy заполнены → три ссылки: /legal/terms, /legal/privacy,
 *    /legal/privacy (cookie описывает политика конфиденциальности);
 *  • политик нет → ни одной ссылки, текст целиком;
 *  • заполнена одна политика → ссылка только у её фраз;
 *  • продавец переписал текст → ссылки только на найденные фразы, без падений;
 *  • продавец стёр текст → пусто;
 *  • разметка в тексте продавца — текст, не HTML (XSS);
 *  • повторный запуск скрипта (перерисовка секции в конструкторе) ссылок не
 *    удваивает;
 *  • ссылка — классом блока (цвет текста, подчёркивание), в той же вкладке;
 *  • в превью конструктора нажатие гасится раньше агента превью, на витрине — нет;
 *  • старые ревизии «Условий» с `[…](/legal/cookies)` не ведут на /legal/cookies.
 *
 * Адреса берутся настоящей функцией `policyUrlsFor` — той же, что ставит
 * глобал сборка и превью (доставку глобала сторожит legal-text-links.spec.ts).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { policyUrlsFor } from "../../utils/footer-data";
import {
  DEFAULT_LEGAL_TEXT,
  POLICY_URLS_GLOBAL,
} from "../../../packages/theme-base/runtime/legal-links";
import { OrderConfirmationClasses } from "../../../packages/theme-base/blocks/OrderConfirmation/OrderConfirmation.classes";
import { CheckoutTermsClasses } from "../../../packages/theme-base/blocks/CheckoutTerms/CheckoutTerms.classes";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

const REWRITTEN =
  "Оформляя заказ, вы принимаете нашу оферту и согласны с Политикой конфиденциальности магазина.";
const UNRELATED = "Спасибо, что выбрали нас!";
const XSS =
  '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>Условиями обслуживания & "кавычки"';
const OLD_TERMS_MARKDOWN =
  "Размещая заказ, вы соглашаетесь с [Условиями обслуживания](/legal/terms), " +
  "[Политикой конфиденциальности](/legal/privacy) и " +
  "[Политикой использования файлов cookie](/legal/cookies). [Оферта](https://merfy.ru/offer)";

/** Задания рендера: имя → задание. «Спасибо» — лестницей и цепочкой витрины. */
const JOBS = {
  thanks: { block: "OrderConfirmation", cascade: true, live: true, props: { id: "OC-1" } },
  thanksRewritten: {
    block: "OrderConfirmation",
    cascade: true,
    live: true,
    props: { id: "OC-2", legalText: REWRITTEN },
  },
  thanksUnrelated: {
    block: "OrderConfirmation",
    cascade: true,
    live: true,
    props: { id: "OC-3", legalText: UNRELATED },
  },
  thanksXss: { block: "OrderConfirmation", cascade: true, live: true, props: { id: "OC-4", legalText: XSS } },
  thanksEmpty: { block: "OrderConfirmation", cascade: true, live: true, props: { id: "OC-5", legalText: "" } },
  // Живой чекаут пяти тем ставит мега-блок БЕЗ пропсов (themes/<t>/src/pages/checkout.astro).
  checkout: { block: "CheckoutForm", pkg: "theme-base", props: {} },
  oldTerms: {
    block: "CheckoutTerms",
    pkg: "theme-base",
    props: {
      text: OLD_TERMS_MARKDOWN,
      links: [
        { label: "Условия обслуживания", url: "/legal/terms" },
        { label: "Политика использования файлов cookie", url: "/legal/cookies" },
      ],
      padding: { top: 0, bottom: 0 },
    },
  },
} as const;
type JobName = keyof typeof JOBS;

function renderTheme(theme: Theme): Record<JobName, string> {
  const names = Object.keys(JOBS) as JobName[];
  const raw = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify(names.map((n) => JOBS[n]))],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 },
  );
  const rows = JSON.parse(raw) as Array<{ html?: string; error?: string; missing?: boolean; pipelineError?: string }>;
  return Object.fromEntries(
    names.map((name, i) => {
      const row = rows[i];
      if (!row?.html) throw new Error(`${theme}/${name}: ${JSON.stringify(row)}`);
      return [name, row.html];
    }),
  ) as Record<JobName, string>;
}

const RENDERED: Record<Theme, Record<JobName, string>> = Object.fromEntries(
  THEMES.map((t) => [t, renderTheme(t)]),
) as Record<Theme, Record<JobName, string>>;

const WITH_POLICIES = [
  { type: "tos", content: "Условия магазина" },
  { type: "privacy", content: "Мы бережём ваши данные." },
];

type Win = Window & Record<string, unknown>;
const win = window as unknown as Win;

/**
 * «Страница»: разметка блока в документ (как с сервера), глобал адресов — как
 * его ставит сборка/превью (только когда карта непуста), затем исполняем
 * НАСТОЯЩИЕ встроенные скрипты правила из этой же разметки.
 */
function loadPage(html: string, policies: Array<{ type: string; content: string }>, theme: Theme): void {
  delete win.__merfyLegalLinks;
  delete win.__merfyLegalLinksBound;
  delete win[POLICY_URLS_GLOBAL];
  delete win.__pwned;
  const urls = policyUrlsFor(policies, theme);
  if (Object.keys(urls).length > 0) win[POLICY_URLS_GLOBAL] = urls;
  document.body.innerHTML = html;
  runLegalScripts();
}

function runLegalScripts(): void {
  const scripts = [...document.querySelectorAll("script")].filter((s) =>
    (s.textContent ?? "").includes("__merfyLegalLinks"),
  );
  if (scripts.length === 0) throw new Error("в разметке блока нет скрипта правила ссылок");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- настоящий скрипт блока
  scripts.forEach((s) => new Function(s.textContent ?? "")());
}

const legalEl = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>("[data-legal-text]");
  if (!el) throw new Error("нет юридической строки [data-legal-text]");
  return el;
};
const links = () =>
  [...legalEl().querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
const plain = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

const THREE_LINKS = [
  ["Условиями обслуживания", "/legal/terms"],
  ["Политикой конфиденциальности", "/legal/privacy"],
  ["Политикой использования файлов cookie", "/legal/privacy"],
];

describe.each(THEMES)("%s: «Спасибо за заказ»", (theme) => {
  const html = RENDERED[theme];

  it("политики tos + privacy заполнены → три ссылки с адресами политик", () => {
    loadPage(html.thanks, WITH_POLICIES, theme);
    expect(links()).toEqual(THREE_LINKS);
    expect(plain(legalEl())).toBe(DEFAULT_LEGAL_TEXT);
  });

  it("ссылка — классом строки, в той же вкладке, помечена правилом", () => {
    loadPage(html.thanks, WITH_POLICIES, theme);
    legalEl()
      .querySelectorAll("a")
      .forEach((a) => {
        expect(a.getAttribute("class")).toBe(OrderConfirmationClasses.legalLink);
        expect(a.hasAttribute("target")).toBe(false);
        expect(a.hasAttribute("data-legal-link")).toBe(true);
      });
  });

  it("политик нет → ссылок нет, текст целиком", () => {
    loadPage(html.thanks, [], theme);
    expect(links()).toEqual([]);
    expect(plain(legalEl())).toBe(DEFAULT_LEGAL_TEXT);
  });

  it("политики пустые (пробелы) → ссылок нет", () => {
    loadPage(html.thanks, [{ type: "tos", content: "  \n" }, { type: "privacy", content: "" }], theme);
    expect(links()).toEqual([]);
  });

  it("заполнены только условия → ссылка только у «Условиями обслуживания»", () => {
    loadPage(html.thanks, [{ type: "tos", content: "Условия" }], theme);
    expect(links()).toEqual([["Условиями обслуживания", "/legal/terms"]]);
    expect(plain(legalEl())).toBe(DEFAULT_LEGAL_TEXT);
  });

  it("продавец переписал текст → ссылка только на найденную фразу", () => {
    loadPage(html.thanksRewritten, WITH_POLICIES, theme);
    expect(links()).toEqual([["Политикой конфиденциальности", "/legal/privacy"]]);
    expect(plain(legalEl())).toBe(REWRITTEN);
  });

  it("текст без фраз правила → без ссылок и без падений", () => {
    loadPage(html.thanksUnrelated, WITH_POLICIES, theme);
    expect(links()).toEqual([]);
    expect(plain(legalEl())).toBe(UNRELATED);
  });

  it("продавец стёр текст → строка пустая", () => {
    loadPage(html.thanksEmpty, WITH_POLICIES, theme);
    expect(plain(legalEl())).toBe("");
    expect(links()).toEqual([]);
  });

  it("разметка в тексте продавца — текст, а не HTML (XSS)", () => {
    loadPage(html.thanksXss, WITH_POLICIES, theme);
    const el = legalEl();
    expect(el.querySelector("img, script")).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="window.__pwned=1">');
    expect(links()).toEqual([["Условиями обслуживания", "/legal/terms"]]);
    expect(win.__pwned).toBeUndefined();
  });

  it("повторный запуск (перерисовка секции) ссылок не удваивает", () => {
    loadPage(html.thanks, WITH_POLICIES, theme);
    runLegalScripts();
    runLegalScripts();
    expect(links()).toEqual(THREE_LINKS);
  });
});

describe.each(THEMES)("%s: чекаут", (theme) => {
  const html = RENDERED[theme];

  it("SSR не ведёт на /legal/* сам по себе (адрес даёт только правило)", () => {
    expect(html.checkout).toContain("data-legal-text");
    expect(html.checkout).not.toMatch(/href="[^"]*\/legal\//);
    expect(html.checkout).not.toContain("/legal/cookies");
  });

  it("политики tos + privacy заполнены → три ссылки с адресами политик", () => {
    loadPage(html.checkout, WITH_POLICIES, theme);
    expect(links()).toEqual(THREE_LINKS);
    expect(plain(legalEl())).toBe(DEFAULT_LEGAL_TEXT);
    legalEl()
      .querySelectorAll("a")
      .forEach((a) => expect(a.getAttribute("class")).toBe(CheckoutTermsClasses.link));
  });

  it("политик нет → ссылок нет, текст целиком", () => {
    loadPage(html.checkout, [], theme);
    expect(links()).toEqual([]);
    expect(plain(legalEl())).toBe(DEFAULT_LEGAL_TEXT);
  });

  it("старая ревизия «Условий» с разметкой ссылок: /legal/cookies нет, свои ссылки продавца целы", () => {
    expect(html.oldTerms).not.toContain("/legal/cookies");
    loadPage(html.oldTerms, [], theme);
    // Без политик — только ссылка продавца на свою оферту.
    expect(links()).toEqual([["Оферта", "https://merfy.ru/offer"]]);
    loadPage(html.oldTerms, WITH_POLICIES, theme);
    expect(links()).toEqual([...THREE_LINKS, ["Оферта", "https://merfy.ru/offer"]]);
  });
});

describe("нажатие на ссылку политики", () => {
  const html = RENDERED.flux.thanks;
  afterEach(() => jest.restoreAllMocks());

  it("витрина: переход не гасится", () => {
    loadPage(html, WITH_POLICIES, "flux");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    legalEl().querySelector("a")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("превью конструктора (iframe): гасится раньше агента превью", () => {
    loadPage(html, WITH_POLICIES, "flux");
    const agent = jest.fn();
    document.addEventListener("click", agent, true);
    jest.spyOn(window, "self", "get").mockReturnValue({} as Window & typeof globalThis);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    legalEl().querySelector("a")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(agent).not.toHaveBeenCalled();
    document.removeEventListener("click", agent, true);
  });
});
