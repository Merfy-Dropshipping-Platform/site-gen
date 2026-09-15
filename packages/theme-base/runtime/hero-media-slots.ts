/**
 * ЕДИНОЕ правило выбора медиа-слотов секции «Изображение» (блок Hero).
 *
 * Панель даёт два слота «Добавить фото» — канон `backgroundImages` типа
 * `imagePair` ({ url1, url2 }); у старых ревизий те же два значения лежат
 * плоско в `backgroundImage` / `backgroundImage2`.
 *
 * Контракт (эталон — rose):
 *   • ни одного фото → `primary`/`secondary` пусты, деления нет;
 *   • ОДНО фото      → оно едет в `primary` и занимает всю ширину, `secondary`
 *                      пуст — неважно, в какой слот мерчант его положил;
 *   • ДВА фото       → `primary` + `secondary`, блок делится 50/50.
 *
 * Почему общий модуль, а не по копии в каждом порту: правило жило четырьмя
 * копиями (rose/bloom/satin/flux), пятая тема (vanilla) второй слот не читала
 * вовсе — и одна из копий разошлась. В satin гейт сплита считался по значению,
 * в которое ДО него подставлялся дизайн-плейсхолдер: одно фото во втором слоте
 * давало деление, где левая половина — `/placeholders/landscape-image.png`.
 * Отчёт владельца «при одном медиафайле блок делится на две части, как будто
 * медиа два» — ровно этот случай.
 *
 * ВАЖНО: на вход подавать ТОЛЬКО значения мерчанта. Плейсхолдер пустого
 * состояния применять к результату (`primary ?? PLACEHOLDER`), иначе гейт снова
 * посчитает заглушку за выбранное фото.
 */

export type HeroMediaSlots = {
  /** Кадр, который показывается всегда, когда фото есть хоть одно. */
  primary: string;
  /** Второй кадр — ТОЛЬКО когда мерчант заполнил оба слота; иначе "". */
  secondary: string;
  /** Блок делится 50/50 (ровно когда заполнены оба слота). */
  split: boolean;
  /** Сколько слотов мерчант реально заполнил: 0, 1 или 2. */
  filled: 0 | 1 | 2;
};

/** Непустая строка → она сама; всё прочее (undefined/null/объект/пробелы) → "". */
function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

/**
 * @param slot1 значение первого слота (`backgroundImages.url1` / `backgroundImage`)
 * @param slot2 значение второго слота (`backgroundImages.url2` / `backgroundImage2`)
 */
export function resolveHeroMediaSlots(slot1: unknown, slot2: unknown): HeroMediaSlots {
  const a = text(slot1);
  const b = text(slot2);
  if (a && b) return { primary: a, secondary: b, split: true, filled: 2 };
  // Одно фото — всегда в primary, чтобы оно занимало блок целиком. Ветка `b`
  // и есть починка отчёта: раньше заполненный второй слот включал сетку из двух
  // колонок, а первая половина оставалась чужой картинкой.
  const only = a || b;
  return { primary: only, secondary: "", split: false, filled: only ? 1 : 0 };
}
