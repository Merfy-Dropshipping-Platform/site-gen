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
 * ИСТОРИЯ ПОПРАВОК (19.09): `:where()` и `@layer base` не помогли / роняли
 * jsdom-гарды (jsdom не разбирает `@layer`). Агент ставил `position: relative`
 * точечно через ensureSubsectionPositioned.
 *
 * 31.10: рамки выделения переехали с outline/::after на плавающие слои
 * `.__merfy_hl` (position:fixed у body, pointer-events:none). Слою нужны только
 * координаты узла, поэтому агент не трогает ни position, ни z-index тем:
 * ensureSubsectionPositioned удалён. Поведение слоёв — в
 * preview-agent-highlight.spec.ts.
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

  it("агент не меняет position подсекций темы", () => {
    expect(SRC).not.toMatch(/function ensureSubsectionPositioned/);
    expect(SRC).not.toMatch(/el\.style\.position = 'relative'/);
  });

  it("cursor:pointer остался — кликабельность подсекции не потеряна", () => {
    expect(SRC).toMatch(/\[data-puck-subsection-parent\]\{cursor:pointer\}/);
  });

  it("САБОТАЖ-ОПОРА: рамки выделения рисуются плавающими слоями, не outline на узле", () => {
    // Если убрать сами рамки, проверки выше станут бессмысленными:
    // сторожить будет нечего.
    expect(SRC).toMatch(/'\.__merfy_hl\{position:fixed;/);
    expect(SRC).toMatch(/pointer-events:none;z-index:2147483000/);
    expect(SRC).toMatch(/section-selected"\]\{border:2px solid #71C0FF/);
    expect(SRC).toMatch(/sub-selected"\]\{border:2px solid #71C0FF/);
    expect(SRC).not.toMatch(/\[data-puck-(sub)?section-(hover|selected)="true"\]\{outline/);
  });
});
