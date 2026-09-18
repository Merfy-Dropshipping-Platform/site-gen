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
 * ПРАВИЛО ПОСЛЕ ПРАВКИ: `position` для подсекции объявлен через `:where()` —
 * специфичность 0, любой класс раскладки перебивает его независимо от порядка.
 * Статичный элемент по-прежнему получает `relative`, а позиционированному он и
 * не нужен: ::after-подсветке достаточно любого позиционированного предка.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "..", "preview.service.ts"),
  "utf-8",
);

describe("превью: правило подсекции уступает раскладке темы", () => {
  it("position объявлен через :where() — иначе он перебьёт absolute у темы", () => {
    expect(SRC).toContain("':where([data-puck-subsection-parent]){position:relative}'");
  });

  it("голого правила с position для подсекции в стилях больше нет", () => {
    // Именно эта форма (специфичность 0,1,0 + поздний порядок) схлопывала слайд.
    expect(SRC).not.toMatch(/'\[data-puck-subsection-parent\]\{position:relative/);
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
