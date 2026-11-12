// Куски текста для ctx.split и пресетов letters, words, lines (12.11, этап 2г спеки анимаций). Своим кодом, без
// библиотеки: текст уходит в aria-label элемента, куски — aria-hidden, пробелы остаются простым текстом между кусками.
// Маска (mask) — обёртка куска с overflow: hidden и запасом снизу под хвосты букв: кусок выезжает из-под неё.

function textOf(element: HTMLElement): string {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  element.setAttribute('aria-label', text);
  element.replaceChildren();
  return text;
}

// Кусок кладётся в элемент сам или внутри маски; возвращается он, а не маска.
function place(element: HTMLElement, text: string, display: 'inline-block' | 'block', mask: boolean): HTMLElement {
  const inner = document.createElement('span');
  inner.setAttribute('aria-hidden', 'true');
  inner.style.display = display;
  inner.textContent = text;
  if (!mask) return element.appendChild(inner);
  const box = document.createElement('span');
  box.style.cssText = `display:${display};overflow:hidden;vertical-align:top;padding-bottom:.12em;margin-bottom:-.12em`;
  box.append(inner);
  element.append(box);
  return inner;
}

export function splitChars(element: HTMLElement): readonly HTMLElement[] {
  const pieces: HTMLElement[] = [];
  for (const char of textOf(element)) {
    if (char === ' ') element.append(' ');
    else pieces.push(place(element, char, 'inline-block', false));
  }
  return pieces;
}

export function splitWords(element: HTMLElement, mask: boolean): readonly HTMLElement[] {
  const text = textOf(element);
  return (text === '' ? [] : text.split(' ')).map((word, index) => {
    if (index > 0) element.append(' ');
    return place(element, word, 'inline-block', mask);
  });
}

// Строки: сначала слова, потом слова с одной высотой склеиваются в строку. Раскладка зависит от шрифта, поэтому
// ждём document.fonts.ready; снятая секция (signal) строк не получает.
export async function splitLines(
  element: HTMLElement,
  mask: boolean,
  signal: AbortSignal,
): Promise<readonly HTMLElement[]> {
  await document.fonts?.ready;
  if (signal.aborted) return [];
  const words = splitWords(element, false);
  const lines: string[][] = [];
  let top = Number.NEGATIVE_INFINITY;
  for (const word of words) {
    if (word.offsetTop - top > word.offsetHeight / 2) {
      lines.push([]);
      top = word.offsetTop;
    }
    lines[lines.length - 1]?.push(word.textContent ?? '');
  }
  element.replaceChildren();
  return lines.map((line) => place(element, line.join(' '), 'block', mask));
}
