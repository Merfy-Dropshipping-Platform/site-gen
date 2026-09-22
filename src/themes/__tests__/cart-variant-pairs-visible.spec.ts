/**
 * @jest-environment jsdom
 *
 * Строка корзины ПОКАЗЫВАЕТ выбранный вариант — проверяется на экране, а не в
 * исходнике.
 *
 * Пункт 26 тестера (22.09): «Корзина не показывает выбранный вариант, в данных
 * options: {"Оттенок":"Sugar Plum"}». Прошлый гард
 * (cart-page-variant-label.spec.ts) проверял только, что секция ЗОВЁТ общий
 * помощник, — и flux его прошёл: вызывал `variantPairs`, а потом схлопывал
 * пары в «цвет»/«размер» с жёсткими подписями «Цвет:»/«Размер:». Опция
 * «Оттенок» печаталась как «Цвет: Sugar Plum», третья опция терялась. Замер
 * 22.09 на живом стенде flux: «Цвет: МАРКЕР_ОТТЕНКА».
 *
 * Здесь исполняется СОБСТВЕННЫЙ скрипт секции в jsdom с настоящей строкой в
 * хранилище, и проверяется текст, который увидит покупатель.
 */
import { renderBlock } from "../../../scripts/qa/lib/render";

const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;

const СТРОКА = {
  id: "p-1|c-1",
  productId: "p-1",
  name: "Глянцевый тинт для губ",
  price: 910,
  image: "",
  quantity: 1,
  variant: {
    options: { Оттенок: "Sugar Plum", Объём: "5 мл", Финиш: "Глянец" },
    variantCombinationId: "c-1",
  },
};

async function показатьКорзину(тема: string): Promise<string> {
  // Скрипты секций обёрнуты в «исполниться один раз на окно»
  // (window.__merfy_hoisted_*). В одном окне jsdom второй рендер той же темы
  // молча НЕ исполнял скрипт — корзина не рисовалась, и отрицательная проверка
  // проходила на пустом месте. Поймано саботажем 22.09. Флаги сбрасываем.
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy_hoisted_"))
      delete (window as unknown as Record<string, unknown>)[k];
  }
  const html = renderBlock(тема, "CartBody", {
    id: "CartBody-1",
    colorScheme: "scheme-1",
  });
  localStorage.clear();
  localStorage.setItem(`${тема}:cart:v1`, JSON.stringify([СТРОКА]));
  // Разметку — без скриптов, их исполняем сами: innerHTML скрипты не запускает.
  const скрипты = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  document.body.innerHTML = html.replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  for (const код of скрипты) {
    try {
      // eslint-disable-next-line no-eval
      (0, eval)(код);
    } catch {
      /* скрипты шапки/чужих секций могут не найти своих узлов — не наше дело */
    }
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  window.dispatchEvent(new Event("load"));
  await new Promise((r) => setTimeout(r, 50));
  return document.body.textContent ?? "";
}

describe("строка корзины показывает ВСЕ опции варианта", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: все опции на экране, и каждая под СВОИМ именем`, async () => {
      const текст = (await показатьКорзину(тема)).replace(/\s+/g, " ");
      // Строка вообще нарисована — иначе проверки ниже сторожат пустоту.
      expect(текст).toContain("Глянцевый тинт для губ");
      expect(текст).toContain("Sugar Plum");
      expect(текст).toContain("5 мл");
      expect(текст).toContain("Глянец");
      // Темы, которые подписывают пары «Имя: Значение», не вправе подменять
      // имя группы своим: «Оттенок» не может стать «Цвет».
      expect(текст).not.toMatch(/Цвет:\s*Sugar Plum/);
      expect(текст).not.toMatch(/Размер:\s*5 мл/);
    });
  }

  it("повторный рендер той же темы в том же окне рисует строку заново", async () => {
    // Сторож самой проверки: без сброса флагов второй рендер был пустым.
    await показатьКорзину("flux");
    const второй = await показатьКорзину("flux");
    expect(второй).toContain("Глянцевый тинт для губ");
  });
});
