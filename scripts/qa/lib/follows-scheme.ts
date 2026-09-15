/**
 * Зонд «едет ли мишень за цветовой схемой» — единственное, что отличает
 * ЛИТЕРАЛ от ТОКЕНА.
 *
 * Мишень меряется при ДВУХ схемах и сравнивается сама с собой:
 *   цвет изменился  → «едет»;
 *   цвет тот же     → «замерла»;
 *   схемы одинаковы по нужной роли → «неразличимо» (и это НЕ «закрыто»).
 *
 * Последний случай обязателен, иначе зонд врёт: у satin Схема 1 чёрно-белая, и
 * на ней `#000000` и `rgb(var(--color-text))` дают одинаковые числа. Пара схем
 * проверяется на различимость ДО замера, и вердикт «неразличимо» — честный
 * ответ «на этих схемах вопрос не решается», а не зелёная галочка.
 */
import { markerSelector, type Marker } from "./markers";
import { probeColor, type ColorProbe } from "./probes";
import {
  normColor,
  rgbOf,
  rolesDiffer,
  schemeNum,
  schemeValue,
  tokensCssFor,
  type RoleDiff,
} from "./schemes";
import { openStage, type Stage } from "./stage";

export type SchemeVerdict =
  | "едет"
  | "замерла"
  | "неразличимо"
  | "мишень не найдена"
  | "нет обёртки схемы";

export type SchemeResult = {
  marker: string;
  prop: string;
  role: string;
  schemeA: string;
  schemeB: string;
  valueA: string | null;
  valueB: string | null;
  /** Что роль обязана дать при каждой схеме (из tokens.css). */
  expectedA: string | null;
  expectedB: string | null;
  /** Мишень взяла именно эту роль (а не «просто изменилась»). */
  matchesRole: boolean | null;
  verdict: SchemeVerdict;
  why: string;
  diff: RoleDiff;
  chainA?: ColorProbe["chain"];
};

const verdictOf = (
  a: string | null,
  b: string | null,
  diff: RoleDiff,
): { verdict: SchemeVerdict; why: string } => {
  if (!diff.distinguishable) return { verdict: "неразличимо", why: diff.why };
  if (a === null || b === null) return { verdict: "мишень не найдена", why: "узел по маркеру не найден" };
  return normColor(a) === normColor(b)
    ? { verdict: "замерла", why: `оба замера ${a}` }
    : { verdict: "едет", why: `${a} → ${b}` };
};

/**
 * Живой стенд: схему переключаем ПОДМЕНОЙ КЛАССА обёртки прямо в DOM.
 *
 * На сайт при этом ничего не пишется — правится только локальная копия
 * страницы в браузере зонда. Ограничение честное: если тема красит секцию
 * инлайновым стилем, посчитанным на сборке, подмена класса его не сдвинет, и
 * зонд скажет «замерла». Такой случай видно по цепочке предков в отчёте.
 */
export async function followsSchemeOnLive(
  stage: Stage,
  opts: {
    marker: Marker | string;
    prop?: "background-color" | "color" | string;
    a: string | number;
    b: string | number;
    role: string;
    tokensCss?: string;
  },
): Promise<SchemeResult> {
  const prop = opts.prop ?? "background-color";
  const tokensCss = opts.tokensCss ?? stage.tokensCss;
  if (!tokensCss) throw new Error("на сцене нет tokens.css — схемы читать неоткуда");
  const a = schemeNum(opts.a);
  const b = schemeNum(opts.b);
  const diff = rolesDiffer(tokensCss, a, b, opts.role);
  const selector = markerSelector(opts.marker);

  const setScheme = async (n: string): Promise<boolean> =>
    stage.page.evaluate(
      ({ selector: sel, n: num }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const host = el.closest('[class*="color-scheme-"]');
        if (!host) return false;
        host.className = host.className.replace(/color-scheme-[0-9]+/g, `color-scheme-${num}`);
        return true;
      },
      { selector, n },
    );

  const okA = await setScheme(a);
  if (!okA) {
    const probe = await probeColor(stage, opts.marker, prop);
    return {
      marker: selector,
      prop,
      role: opts.role,
      schemeA: a,
      schemeB: b,
      valueA: null,
      valueB: null,
      expectedA: rgbOf(schemeValue(tokensCss, a, opts.role)),
      expectedB: rgbOf(schemeValue(tokensCss, b, opts.role)),
      matchesRole: null,
      verdict: probe.found ? "нет обёртки схемы" : "мишень не найдена",
      why: probe.found
        ? "у мишени нет предка с классом color-scheme-N — блок не принимает схему НИКОГДА"
        : `узел ${selector} на странице не найден`,
      diff,
      chainA: probe.chain,
    };
  }
  const probeA = await probeColor(stage, opts.marker, prop);
  await setScheme(b);
  const probeB = await probeColor(stage, opts.marker, prop);
  await setScheme(a);

  return finish({
    selector,
    prop,
    role: opts.role,
    a,
    b,
    tokensCss,
    probeA,
    probeB,
    diff,
  });
}

/** Локальный рендер: секция рисуется ЗАНОВО под каждой схемой (как витрина). */
export async function followsSchemeLocal(opts: {
  theme: string;
  block: string;
  marker: Marker | string;
  prop?: "background-color" | "color" | string;
  a: string | number;
  b: string | number;
  role: string;
  props?: Record<string, unknown>;
  schemes?: Array<Record<string, unknown>>;
  width?: number;
  height?: number;
}): Promise<SchemeResult> {
  const prop = opts.prop ?? "background-color";
  const tokensCss = tokensCssFor(opts.theme, opts.schemes);
  const a = schemeNum(opts.a);
  const b = schemeNum(opts.b);
  const diff = rolesDiffer(tokensCss, a, b, opts.role);
  const selector = markerSelector(opts.marker);

  const measure = async (scheme: string): Promise<ColorProbe> => {
    const stage = await openStage({
      kind: "local",
      theme: opts.theme,
      blocks: [{ block: opts.block, props: opts.props }],
      schemeId: scheme,
      schemes: opts.schemes,
      width: opts.width,
      height: opts.height,
    });
    try {
      return await probeColor(stage, opts.marker, prop);
    } finally {
      await stage.close();
    }
  };

  const probeA = await measure(a);
  const probeB = await measure(b);
  return finish({ selector, prop, role: opts.role, a, b, tokensCss, probeA, probeB, diff });
}

function finish(args: {
  selector: string;
  prop: string;
  role: string;
  a: string;
  b: string;
  tokensCss: string;
  probeA: ColorProbe;
  probeB: ColorProbe;
  diff: RoleDiff;
}): SchemeResult {
  const { selector, prop, role, a, b, tokensCss, probeA, probeB, diff } = args;
  // У прозрачной мишени судим по тому, что видит глаз (цепочка предков):
  // поле поиска прозрачно, а цвет несёт форма-обёртка.
  const pick = (p: ColorProbe): string | null =>
    prop === "background-color" ? (p.effective ?? p.value) : p.value;
  const valueA = probeA.found ? pick(probeA) : null;
  const valueB = probeB.found ? pick(probeB) : null;
  const expectedA = rgbOf(schemeValue(tokensCss, a, role));
  const expectedB = rgbOf(schemeValue(tokensCss, b, role));
  const base =
    !probeA.found || !probeB.found
      ? { verdict: "мишень не найдена" as SchemeVerdict, why: `узел ${selector} не найден` }
      : verdictOf(valueA, valueB, diff);
  const matchesRole =
    expectedA === null || expectedB === null || valueA === null || valueB === null
      ? null
      : normColor(valueA) === normColor(expectedA) && normColor(valueB) === normColor(expectedB);
  return {
    marker: selector,
    prop,
    role,
    schemeA: a,
    schemeB: b,
    valueA,
    valueB,
    expectedA,
    expectedB,
    matchesRole,
    verdict: base.verdict,
    why: base.why,
    diff,
    chainA: probeA.chain,
  };
}
