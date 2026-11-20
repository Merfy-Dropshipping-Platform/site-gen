// Запись src у <img> при серверном srcset (модуль картинок, шаг 3). Сборка магазина ставит у картинок нашего хранилища
// srcset с копиями под экран, а пока он есть, браузер берёт картинку из него и новый src не показывает. Ядро при записи
// src через El.attr просто снимает srcset (build/build.ts: ядро на пределе бюджета, лишнего кода там нет). Эта функция —
// для поведений вне ядра: srcset берётся у такого же адреса на странице (миниатюра, прежнее фото этой же рамки), иначе
// снимается и браузер показывает оригинал. sizes не трогается. Секциям srcset не открыт (attributes.ts).
const sets = new Map<string, string>();

export function setImgSrc(img: Element, src: string): void {
  for (const other of document.images) if (other.srcset) sets.set(other.getAttribute('src') ?? '', other.srcset);
  const set = sets.get(src);
  if (set === undefined) img.removeAttribute('srcset');
  else img.setAttribute('srcset', set);
  img.setAttribute('src', src);
}
