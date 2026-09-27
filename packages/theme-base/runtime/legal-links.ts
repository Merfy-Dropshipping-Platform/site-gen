/**
 * Ссылки на политики продавца в юридической строке — ОДНО правило для
 * «Спасибо за заказ» (OrderConfirmation.legalText) и чекаута (CheckoutTerms).
 *
 * Владелец 28.09: в строке «Размещая заказ, вы соглашаетесь с Условиями
 * обслуживания, Политикой конфиденциальности и Политикой использования файлов
 * cookie» названия документов — ссылки на тексты политик продавца, во всех
 * пяти темах, на витрине и в превью одинаково.
 *
 *  • Фраза → документ платформы (site_policy.type) — таблица LEGAL_PHRASES.
 *    Отдельной политики cookie в платформе нет: cookie описывает политика
 *    конфиденциальности, поэтому третья фраза ведёт туда же.
 *  • Адреса ЗАПОЛНЕННЫХ политик приезжают глобалом `__MERFY_POLICY_URLS__`
 *    ({ tos: "/legal/terms", privacy: "/legal/privacy", … }). Его ставят
 *    сборка витрины (build.service, themes-v2) и превью конструктора
 *    (preview.controller, все пути) из одной функции `policyUrlsFor`
 *    (src/utils/footer-data.ts) — тем же правилом, что ссылки подвала и баннер
 *    cookie. Политика не заполнена — адреса нет, фраза остаётся текстом (не
 *    ведём на демо-текст темы по /legal/*).
 *  • Текст продавца (legalText — поле конструктора) не разбирается как HTML:
 *    рантайм ходит по ТЕКСТОВЫМ узлам и вставляет только свои `<a>` с адресом
 *    из глобала. Фразы нет (продавец переписал) — ссылки нет, текст как есть.
 *    Текст уже внутри ссылки (разметка `[текст](url)` в CheckoutTerms) не
 *    трогается.
 *  • В превью конструктора (iframe) нажатие на такую ссылку гасится до агента
 *    превью той же функцией, что в баннере cookie
 *    (runtime/preview-click-guard.ts): навигация конструктора по неизвестному
 *    адресу автосоздаёт страницу.
 *
 * Дист темы один на все магазины, а «Спасибо» и чекаут местами оживляются
 * скриптами, поэтому признак приходит глобалом, а не сервером в разметку.
 *
 * Блоки получают рантайм строкой (`LEGAL_LINKS_SOURCE` в
 * `<script is:inline set:html>` сразу после текста): `createLegalLinker` и
 * `guardPreviewClicks` — самодостаточные функции, `.toString()` тех же
 * функций, второй копии нет.
 */

import { guardPreviewClicks } from "./preview-click-guard";

export const POLICY_URLS_GLOBAL = "__MERFY_POLICY_URLS__";

/** Документ платформы (site_policy.type), на который ведёт фраза. */
export type LegalPolicyType = "tos" | "privacy" | "refund" | "shipping";

export interface LegalPhrase {
  phrase: string;
  policy: LegalPolicyType;
}

/** Фраза юридической строки → документ. Одна таблица на все блоки. */
export const LEGAL_PHRASES: ReadonlyArray<LegalPhrase> = [
  { phrase: "Условиями обслуживания", policy: "tos" },
  { phrase: "Политикой конфиденциальности", policy: "privacy" },
  { phrase: "Политикой использования файлов cookie", policy: "privacy" },
];

/** Стандартная строка «Спасибо» и чекаута (без разметки ссылок). */
export const DEFAULT_LEGAL_TEXT =
  "Размещая заказ, вы соглашаетесь с Условиями обслуживания, Политикой конфиденциальности и Политикой использования файлов cookie.";

/**
 * Атрибуты разметки: строка под правило (ставит блок), класс ссылки из
 * *.classes.ts блока (ставит блок), отметка нашей ссылки (ставит рантайм).
 */
export const LEGAL_TEXT_ATTR = "data-legal-text";
export const LEGAL_LINK_CLASS_ATTR = "data-legal-link-class";
export const LEGAL_LINK_ATTR = "data-legal-link";

export interface LegalAttrs {
  text: string;
  linkClass: string;
  link: string;
}
const LEGAL_ATTRS: LegalAttrs = {
  text: LEGAL_TEXT_ATTR,
  linkClass: LEGAL_LINK_CLASS_ATTR,
  link: LEGAL_LINK_ATTR,
};

export interface LegalSegment {
  text: string;
  href: string | null;
}

export interface LegalLinker {
  readUrls: (win: unknown) => Record<string, string>;
  segments: (text: string, urls: Record<string, string>) => LegalSegment[];
  link: (el: Element, urls: Record<string, string>) => number;
  linkAll: (doc: Document) => number;
}

/**
 * Весь рантайм одной функцией: встроенные скрипты блоков получают её
 * исходником. Внутри — без импортов и внешних имён.
 */
export function createLegalLinker(
  phrases: ReadonlyArray<LegalPhrase>,
  globalName: string,
  attrs: LegalAttrs,
): LegalLinker {
  const byPhrase: Record<string, string> = {};
  phrases.forEach(function (p) {
    byPhrase[p.phrase] = p.policy;
  });
  // Длинные фразы первыми — чтобы более короткая не откусила начало длинной.
  const pattern = phrases
    .map(function (p) {
      return p.phrase;
    })
    .sort(function (a, b) {
      return b.length - a.length;
    })
    .map(function (s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("|");

  /** Только путь своего сайта: `/legal/terms`; чужой хост и схемы не проходят. */
  function ownPath(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const url = value.trim();
    return url.charAt(0) === "/" && url.charAt(1) !== "/" ? url : null;
  }

  function readUrls(win: unknown): Record<string, string> {
    const raw = win && (win as Record<string, unknown>)[globalName];
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (type) {
      const url = ownPath((raw as Record<string, unknown>)[type]);
      if (url) out[type] = url;
    });
    return out;
  }

  function segments(text: string, urls: Record<string, string>): LegalSegment[] {
    const src = String(text == null ? "" : text);
    const out: LegalSegment[] = [];
    if (!pattern) return [{ text: src, href: null }];
    const re = new RegExp(pattern, "g");
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m.index > last) out.push({ text: src.slice(last, m.index), href: null });
      out.push({ text: m[0], href: urls[byPhrase[m[0]]] || null });
      last = m.index + m[0].length;
    }
    if (last < src.length) out.push({ text: src.slice(last), href: null });
    return out;
  }

  function textNodesOutsideLinks(el: Element): Text[] {
    const doc = el.ownerDocument;
    const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    const nodes: Text[] = [];
    let n = walker.nextNode();
    while (n) {
      const parent = (n as Text).parentElement;
      if (!(parent && parent.closest("a"))) nodes.push(n as Text);
      n = walker.nextNode();
    }
    return nodes;
  }

  function replaceTextNode(node: Text, parts: LegalSegment[], linkClass: string): void {
    const doc = node.ownerDocument;
    const frag = doc.createDocumentFragment();
    parts.forEach(function (part) {
      if (!part.href) {
        frag.appendChild(doc.createTextNode(part.text));
        return;
      }
      const a = doc.createElement("a");
      a.setAttribute("href", part.href);
      a.setAttribute(attrs.link, "");
      if (linkClass) a.setAttribute("class", linkClass);
      a.textContent = part.text;
      frag.appendChild(a);
    });
    node.parentNode!.replaceChild(frag, node);
  }

  /** Проставить ссылки в одном элементе. Повторный вызов ничего не меняет. */
  function link(el: Element, urls: Record<string, string>): number {
    const linkClass = el.getAttribute(attrs.linkClass) || "";
    let count = 0;
    textNodesOutsideLinks(el).forEach(function (node) {
      const parts = segments(node.data, urls);
      const linked = parts.filter(function (p) {
        return p.href;
      }).length;
      if (!linked) return;
      replaceTextNode(node, parts, linkClass);
      count += linked;
    });
    return count;
  }

  /**
   * Все юридические строки страницы. Проход по каждой отметке независим и
   * идемпотентен (first-match здесь нет), поэтому адресация от документа, а не
   * от корня блока: строку чекаута рисует вложенный блок без своего id.
   */
  function linkAll(doc: Document): number {
    const urls = readUrls(doc.defaultView);
    if (!Object.keys(urls).length) return 0;
    let count = 0;
    doc.querySelectorAll("[" + attrs.text + "]").forEach(function (el) {
      count += link(el, urls);
    });
    return count;
  }

  return {
    readUrls: readUrls,
    segments: segments,
    link: link,
    linkAll: linkAll,
  };
}

/** Рантайм для тестов и серверного кода (тот же, что едет строкой в блоки). */
export const legalLinker = createLegalLinker(LEGAL_PHRASES, POLICY_URLS_GLOBAL, LEGAL_ATTRS);

/**
 * Строка для `<script is:inline set:html={…}>` сразу после юридического
 * текста: ставит `window.__merfyLegalLinks` (один раз на окно), гасит клики в
 * превью и проставляет ссылки во всех отметках, уже стоящих в документе.
 */
export const LEGAL_LINKS_SOURCE = `
(function () {
  // Транспайлер с keepNames (tsx/esbuild) оборачивает функции в __name(…) —
  // в браузере такого имени нет. Локальная заглушка, чтобы исходник жил везде.
  var __name = function (f) { return f; };
  if (!window.__merfyLegalLinks) {
    window.__merfyLegalLinks = (${createLegalLinker.toString()})(${JSON.stringify(LEGAL_PHRASES)}, ${JSON.stringify(POLICY_URLS_GLOBAL)}, ${JSON.stringify(LEGAL_ATTRS)});
  }
  if (!window.__merfyLegalLinksBound) {
    window.__merfyLegalLinksBound = true;
    (${guardPreviewClicks.toString()})(window, ${JSON.stringify(`[${LEGAL_LINK_ATTR}]`)});
  }
  window.__merfyLegalLinks.linkAll(document);
})();
`.trim();
