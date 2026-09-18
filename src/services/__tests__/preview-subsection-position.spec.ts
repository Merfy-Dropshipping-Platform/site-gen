/**
 * Подсветка кликабельных подсекций не ломает раскладку темы.
 *
 * Владелец, 18.09: «в ванилле секция слайда… там нет как будто слайдов самих и
 * стрелок. вот в блуме есть».
 *
 * ЗАМЕР ДО (живой конструктор, стенд vanilla, добавлена секция «Слайд-шоу»):
 * блок 1280×852, дорожка слайдов 1280×790, а САМ слайд — 1280×**0**, и картинка
 * внутри тоже 0 при `naturalWidth` 1920×960, то есть файл загрузился и просто
 * был схлопнут. Разметка слайда: `class="absolute inset-0 z-0 …"`, computed
 * `position: relative`. Виновник найден перебором правил документа:
 * `[data-puck-subsection-parent]{position:relative}` из превью — специфичность
 * (0,1,0) как у утилиты `.absolute`, но правило идёт ПОЗЖЕ бандла Tailwind и
 * потому побеждает. `inset-0` у `relative` ничего не растягивает → высота 0.
 *
 * Тема ставит `data-puck-subsection-parent` на абсолютный слайд законно: это
 * кликабельная подсекция. Значит уступать должно превью, а не тема.
 *
 * ДВЕ ПОПРАВКИ ПОСЛЕ ВЫКАТКИ (19.09).
 *
 * 1. Версия с `:where()` уехала в прод и НЕ помогла — замер на выкаченном
 *    превью дал тот же схлопнутый слайд. Проба в том же документе объяснила
 *    почему: пустой `div` с `absolute inset-0` резолвится в `absolute`, а тот
 *    же `div` с `data-puck-subsection-parent` — в `relative`. Специфичность ни
 *    при чём: утилиты Tailwind v4 лежат внутри `@layer`, а правило вне слоёв
 *    сильнее любого слоя при любом селекторе.
 * 2. `@layer base` в живом браузере сработал (проверено подменой стилей на
 *    месте: слайд поднялся с 0 до 790px), но jsdom не разбирает `@layer` и
 *    роняет соседние гарды агента с «Could not parse CSS stylesheet».
 *
 * ИТОГОВОЕ РЕШЕНИЕ: правила `position` в стилях превью НЕТ вовсе. Агент ставит
 * `position: relative` точечно и только тем подсекциям, у которых computed
 * position === 'static' — позиционированный элемент не трогается, он и так
 * годится в предки для ::after-подсветки.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "..", "preview.service.ts"),
  "utf-8",
);

describe("превью: правило подсекции уступает раскладке темы", () => {
  it("в стилях превью нет правила position для подсекции — ни в каком виде", () => {
    // Любая из трёх форм (голая, :where, @layer) либо ломала раскладку темы,
    // либо роняла jsdom-гарды агента.
    // Ищем именно строковые литералы стилей, а не упоминания в комментариях.
    expect(SRC).not.toMatch(/'[^'\n]*\[data-puck-subsection-parent\]\{position:relative/);
    expect(SRC).not.toMatch(/'@layer[^'\n]*data-puck-subsection-parent/);
  });

  it("агент ставит relative точечно и только статичным подсекциям", () => {
    expect(SRC).toMatch(/function ensureSubsectionPositioned\(el\)/);
    // Уже позиционированный элемент не трогаем — иначе вернётся тот же баг.
    expect(SRC).toMatch(/cs\.position !== 'static'\) return/);
    expect(SRC).toMatch(/el\.style\.position = 'relative'/);
  });

  it("простановка вызвана на обоих путях подсветки — hover и выделение", () => {
    const hover = SRC.indexOf("setAttribute('data-puck-subsection-hover', 'true')");
    const sel = SRC.indexOf("setAttribute('data-puck-subsection-selected', 'true')");
    expect(hover).toBeGreaterThan(-1);
    expect(sel).toBeGreaterThan(-1);
    // Вызов стоит непосредственно перед простановкой атрибута.
    expect(SRC.slice(hover - 200, hover)).toContain("ensureSubsectionPositioned");
    expect(SRC.slice(sel - 200, sel)).toContain("ensureSubsectionPositioned");
  });

  it("cursor:pointer остался — кликабельность подсекции не потеряна", () => {
    expect(SRC).toMatch(/\[data-puck-subsection-parent\]\{cursor:pointer\}/);
  });

  it("САБОТАЖ-ОПОРА: подсветка подсекции по-прежнему рисуется ::after поверх", () => {
    // Если убрать саму подсветку, три проверки выше станут бессмысленными:
    // сторожить будет нечего.
    expect(SRC).toMatch(/\[data-puck-subsection-hover="true"\]\{outline:2px solid/);
    expect(SRC).toMatch(/\[data-puck-subsection-selected="true"\]\{outline:2px solid/);
  });
});
