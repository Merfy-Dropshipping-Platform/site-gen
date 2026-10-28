// Проверки вёрстки снимка в настоящем Chromium (28.10): на каждую проверку — страница, где она срабатывает, и страница,
// где не должна (в том числе намеренные наложения, иконки соцсетей, ссылка в абзаце). Пропускается, если браузера
// Playwright нет (`pnpm exec playwright install chromium`). Сети не нужно: картинки — data:-адреса.
import { existsSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { ChromiumRenderer } from '../src/look/look-browser';
import { runLayoutChecks } from '../src/look/look-layout';
import type { LookDevice } from '../src/look/look-types';

const hasChromium = existsSync(chromium.executablePath());

// PNG заданного размера одного цвета: нужны натуральные пропорции картинки без файлов и сети.
function png(width: number, height: number, [red, green, blue]: [number, number, number] = [200, 200, 200]): string {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [red, green, blue]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const file = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${file.toString('base64')}`;
}

const page = (body: string, css = ''): string =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.4 sans-serif}img{display:block}${css}</style></head>
<body>${body}</body></html>`;

const renderer = new ChromiumRenderer();
afterAll(() => renderer.close());

async function codesOn(html: string, device: LookDevice = 'mobile'): Promise<string[]> {
  const rendered = await renderer.open({ html, devices: [device] });
  try {
    const [session] = rendered.sessions;
    if (session === undefined) throw new Error('нет экрана');
    return (await session.layout()).map((finding) => finding.code);
  } finally {
    await rendered.close();
  }
}

interface Case {
  name: string;
  html: string;
  device?: LookDevice;
  // Какие коды должны быть среди находок; `none` — никаких находок вообще.
  expected: string;
}

const IMG_A = png(40, 40);
const wideImg = png(80, 40);

// Карточки в ряд: общий CSS.
const CARDS_CSS =
  '.row{display:flex;gap:12px;padding:0 16px}.card{flex:1;border:1px solid #888;background:#fff}.card p{margin:8px}';

const CASES: Case[] = [
  // ---- row-unequal ----
  {
    name: 'row-unequal: фото в карточках разной высоты',
    expected: 'row-unequal',
    html: page(
      `<merfy-section data-section="products" data-section-id="products-1"><div class="row">
<div class="card"><img src="${IMG_A}" style="width:100%;height:100px"><p>Шарф</p></div>
<div class="card"><img src="${IMG_A}" style="width:100%;height:140px"><p>Шарф</p></div>
<div class="card"><img src="${IMG_A}" style="width:100%;height:100px"><p>Шарф</p></div></div></merfy-section>`,
      CARDS_CSS + '.row{align-items:flex-start}',
    ),
  },
  {
    name: 'row-unequal: карточки с рамкой разной высоты (низ не выровнен)',
    expected: 'row-unequal',
    html: page(
      '<div class="row"><div class="card"><p>Коротко</p><p>Две строки</p></div><div class="card"><p>Длинный текст карточки, который занимает несколько строк и тянет её вниз</p></div></div>',
      CARDS_CSS + '.row{align-items:flex-start}',
    ),
  },
  {
    name: 'row-unequal: нет — фото с aspect-ratio, карточки растянуты',
    expected: 'none',
    html: page(
      `<div class="row">${[1, 2]
        .map(
          (n) =>
            `<div class="card"><img src="${wideImg}" style="width:100%;aspect-ratio:4/5;object-fit:cover"><p>${'Шарф '.repeat(n)}</p></div>`,
        )
        .join('')}</div>`,
      CARDS_CSS,
    ),
  },
  {
    name: 'row-unequal: нет — колонки текста без рамки разной длины',
    expected: 'none',
    html: page(
      '<div class="row" style="align-items:flex-start"><div style="flex:1"><p>Коротко</p></div><div style="flex:1"><p>Намного более длинный текст колонки, который не видно по рамке, потому что рамки нет вовсе</p></div></div>',
      '.row{display:flex;gap:12px;padding:0 16px}',
    ),
  },
  {
    name: 'row-unequal: нет — аккордеоны раскрыты по-разному',
    expected: 'none',
    html: page(
      '<div class="row"><details class="card" open><summary>Вопрос</summary><p>Ответ длинный<br>в две строки<br>и ещё</p></details><details class="card"><summary>Вопрос</summary><p>Ответ</p></details></div>',
      CARDS_CSS + '.row{align-items:flex-start}',
    ),
  },
  // ---- row-not-filling ----
  {
    name: 'row-not-filling: 8 полосок по 20 px в ряду на всю ширину',
    expected: 'row-not-filling',
    html: page(
      `<div class="bars">${'<i class="bar"></i>'.repeat(8)}</div>`,
      '.bars{display:flex;gap:4px;padding:0 16px;width:100%}.bar{display:block;width:20px;height:3px;background:#222}',
    ),
  },
  {
    name: 'row-not-filling: нет — полоски flex-1 на всю ширину',
    expected: 'none',
    html: page(
      `<div class="bars">${'<i class="bar"></i>'.repeat(8)}</div>`,
      '.bars{display:flex;gap:4px;padding:0 16px;width:100%}.bar{display:block;flex:1;height:3px;background:#222}',
    ),
  },
  {
    name: 'row-not-filling: нет — точки-индикаторы по центру',
    expected: 'none',
    html: page(
      `<div class="dots">${'<span class="dot" role="tab"></span>'.repeat(5)}</div>`,
      '.dots{display:flex;gap:6px;justify-content:center}.dot{display:block;width:8px;height:8px;border-radius:50%;background:#222}',
    ),
  },
  {
    name: 'row-not-filling: полоски с role="tab" выше 12 px тоже считаются',
    expected: 'row-not-filling',
    html: page(
      `<div class="bars">${'<button role="tab" class="bar" aria-label="Сторис"></button>'.repeat(4)}</div>`,
      '.bars{display:flex;gap:4px;padding:0 16px;width:100%}.bar{display:block;width:40px;height:20px;border:0;background:#222}',
    ),
  },
  // ---- overflow-x ----
  {
    name: 'overflow-x: блок шире экрана на телефоне',
    expected: 'overflow-x',
    html: page(
      '<merfy-section data-section="promo" data-section-id="promo-1"><div style="width:600px;height:40px;background:#c00">Акция</div></merfy-section>',
    ),
  },
  {
    name: 'overflow-x: нет — карусель с прокруткой внутри экрана',
    expected: 'none',
    html: page(
      '<div style="overflow-x:auto"><div style="display:flex;width:900px"><div style="width:300px;height:40px;background:#ccc"></div><div style="width:300px;height:40px;background:#aaa"></div><div style="width:300px;height:40px;background:#888"></div></div></div>',
    ),
  },
  {
    name: 'overflow-x: на компьютере не запускается',
    device: 'desktop',
    expected: 'none',
    html: page('<div style="width:2000px;height:40px;background:#c00">Акция</div>'),
  },
  // ---- text-clipped ----
  {
    name: 'text-clipped: заголовок обрезан фиксированной высотой',
    expected: 'text-clipped',
    html: page(
      '<merfy-section data-section="hero" data-section-id="hero-1"><h2 style="height:24px;overflow:hidden;margin:16px;font-size:20px">Очень длинный заголовок, который не помещается в одну строку на экране телефона</h2></merfy-section>',
    ),
  },
  {
    name: 'text-clipped: нет — line-clamp',
    expected: 'none',
    html: page(
      '<p style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:16px">Длинный абзац, который обрезается по двум строкам намеренно, потому что стоит line-clamp, и в нём достаточно слов, чтобы занять больше двух строк на экране телефона.</p>',
    ),
  },
  {
    name: 'text-clipped: нет — многоточие',
    expected: 'none',
    html: page(
      '<p style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:16px">Длинная строка, которая обрезается многоточием, потому что не помещается в ширину экрана телефона</p>',
    ),
  },
  {
    name: 'text-clipped: нет — карусель показывает следующую карточку краем',
    expected: 'none',
    html: page(
      '<div style="overflow:hidden"><div style="display:flex;gap:16px;width:900px"><div style="width:300px;padding:16px;background:#eee"><h3>Первая карточка</h3></div><div style="width:300px;padding:16px;background:#ddd"><h3>Вторая карточка с длинным названием</h3></div></div></div>',
    ),
  },
  // ---- overlap ----
  {
    name: 'overlap: две кнопки лежат друг на друге',
    expected: 'overlap',
    html: page(
      '<div style="position:relative;height:120px;margin:16px"><button style="position:absolute;left:0;top:0;width:140px;height:48px">Купить</button><button style="position:absolute;left:80px;top:10px;width:140px;height:48px">В корзину</button></div>',
    ),
  },
  {
    name: 'overlap: крестик на заголовке',
    expected: 'overlap',
    html: page(
      '<div style="position:relative;margin:16px"><h2 style="margin:0">Подписка на новости магазина</h2><button aria-label="Закрыть" style="position:absolute;right:60px;top:0;width:44px;height:44px">×</button></div>',
    ),
  },
  {
    name: 'overlap: нет — текст поверх фото первого экрана и кнопка под ним',
    expected: 'none',
    html: page(
      `<div style="position:relative;height:300px"><img src="${IMG_A}" style="width:100%;height:300px;object-fit:cover" alt=""><h1 style="position:absolute;left:16px;top:60px;margin:0;color:#fff">Тёплые шарфы</h1><p style="position:absolute;left:16px;top:120px;margin:0;color:#fff">Новая коллекция</p><a href="/c" style="position:absolute;left:16px;top:200px;display:block;min-height:48px;padding:12px 24px;background:#fff">Смотреть</a></div>`,
    ),
  },
  {
    name: 'overlap: нет — иконки соцсетей в ряд',
    expected: 'none',
    html: page(
      `<div style="display:flex;gap:8px;padding:16px">${['vk', 'tg', 'ok', 'yt']
        .map(
          (n) =>
            `<a href="/${n}" aria-label="${n}" style="display:flex;width:48px;height:48px;align-items:center;justify-content:center"><svg width="24" height="24"><circle cx="12" cy="12" r="10"/></svg></a>`,
        )
        .join('')}</div>`,
    ),
  },
  {
    name: 'overlap: нет — кнопка «в избранное» на фото-ссылке карточки',
    expected: 'none',
    html: page(
      `<div style="position:relative;margin:16px;width:200px"><a href="/p"><img src="${IMG_A}" style="width:200px;height:200px" alt=""></a><button aria-label="В избранное" style="position:absolute;right:8px;top:8px;width:48px;height:48px">♥</button></div>`,
    ),
  },
  // ---- image-distorted ----
  {
    name: 'image-distorted: картинка 2:1 втиснута в квадрат',
    expected: 'image-distorted',
    html: page(`<img src="${wideImg}" style="width:200px;height:200px;margin:16px" alt="">`),
  },
  {
    name: 'image-distorted: нет — object-fit cover',
    expected: 'none',
    html: page(`<img src="${wideImg}" style="width:200px;height:200px;object-fit:cover;margin:16px" alt="">`),
  },
  {
    name: 'image-distorted: нет — пропорции сохранены',
    expected: 'none',
    html: page(`<img src="${wideImg}" style="width:200px;height:auto;margin:16px" alt="">`),
  },
  // ---- tap-small, text-small, columns-many ----
  {
    name: 'tap-small: кнопка 32 px',
    expected: 'tap-small',
    html: page('<button style="height:32px;margin:16px;padding:0 16px">Купить</button>'),
  },
  {
    name: 'tap-small: нет — кнопка 48 px и ссылка внутри абзаца',
    expected: 'none',
    html: page(
      '<button style="height:48px;margin:16px;padding:0 16px">Купить</button><p style="margin:16px;font-size:16px">Читайте <a href="/terms">условия доставки</a> перед заказом.</p>',
    ),
  },
  {
    name: 'tap-small: на компьютере не запускается',
    device: 'desktop',
    expected: 'none',
    html: page('<button style="height:32px;margin:16px;padding:0 16px">Купить</button>'),
  },
  {
    name: 'text-small: подпись 10 px',
    expected: 'text-small',
    html: page('<p style="margin:16px;font-size:10px">Доставка по всей России от двух дней</p>'),
  },
  {
    name: 'text-small: нет — 12 px и крупнее',
    expected: 'none',
    html: page('<p style="margin:16px;font-size:12px">Доставка по России</p><p style="font-size:16px">Текст</p>'),
  },
  {
    name: 'text-small: на компьютере не запускается',
    device: 'desktop',
    expected: 'none',
    html: page('<p style="margin:16px;font-size:10px">Доставка по всей России от двух дней</p>'),
  },
  {
    name: 'columns-many: три колонки карточек с фото на телефоне',
    expected: 'columns-many',
    html: page(
      `<div class="row">${[1, 2, 3].map(() => `<div class="card"><img src="${IMG_A}" style="width:100%;aspect-ratio:1;object-fit:cover"><p>Шарф</p></div>`).join('')}</div>`,
      CARDS_CSS,
    ),
  },
  {
    name: 'columns-many: нет — две колонки',
    expected: 'none',
    html: page(
      `<div class="row">${[1, 2].map(() => `<div class="card"><img src="${IMG_A}" style="width:100%;aspect-ratio:1;object-fit:cover"><p>Шарф</p></div>`).join('')}</div>`,
      CARDS_CSS,
    ),
  },
  {
    name: 'columns-many: нет — три фото без текста (галерея)',
    expected: 'none',
    html: page(
      `<div class="row">${[1, 2, 3].map(() => `<div class="card"><img src="${IMG_A}" style="width:100%;aspect-ratio:1;object-fit:cover"></div>`).join('')}</div>`,
      CARDS_CSS,
    ),
  },
];

describe.skipIf(!hasChromium)('проверки вёрстки · настоящий Chromium', () => {
  it.each(CASES)(
    '$name',
    async ({ html, expected, device }) => {
      const codes = await codesOn(html, device ?? 'mobile');
      if (expected === 'none') expect(codes).toEqual([]);
      else expect(codes).toContain(expected);
    },
    60_000,
  );

  it('находка несёт секцию, место и русский текст «что не так · как починить»', async () => {
    const html = CASES.find((item) => item.name.startsWith('row-unequal: фото'))?.html ?? '';
    const rendered = await renderer.open({ html, devices: ['mobile'] });
    try {
      const [session] = rendered.sessions;
      const found = (await session?.layout()) ?? [];
      const first = found.find((finding) => finding.code === 'row-unequal');
      expect(first?.section).toBe('products-1');
      expect(first?.text).toMatch(/разной высоты.* · .*aspect-/);
      expect(first?.clip.width).toBeGreaterThan(300);
    } finally {
      await rendered.close();
    }
  }, 60_000);

  it('вырезка — JPEG именно того места, куда указывает находка (картинка ниже первого экрана)', async () => {
    const green = png(80, 40, [0, 160, 0]);
    const html = page(
      `<div style="height:1500px;background:#eee">пустое место</div><img src="${green}" style="width:200px;height:200px;margin:0 20px" alt=""><div style="height:600px"></div>`,
    );
    const rendered = await renderer.open({ html, devices: ['mobile'] });
    try {
      const result = await runLayoutChecks(rendered.sessions);
      const [finding] = result.findings;
      expect(finding?.code).toBe('image-distorted');
      expect(finding?.image).not.toBeNull();
      expect(finding?.clip?.y).toBeGreaterThan(1_400);
      const center = await pixelAtCenter(finding?.image ?? '');
      expect(center.green).toBeGreaterThan(120);
      expect(center.red).toBeLessThan(60);
      expect(result.clipBytes).toBeGreaterThan(0);
    } finally {
      await rendered.close();
    }
  }, 60_000);

  it('страница с сотнями элементов проверяется быстро', async () => {
    const cards = Array.from(
      { length: 400 },
      (_, n) => `<div class="card"><p>Карточка ${n}</p><a href="/p${n}">Подробнее</a></div>`,
    ).join('');
    const html = page(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${cards}</div>`, CARDS_CSS);
    const rendered = await renderer.open({ html, devices: ['mobile'] });
    try {
      const started = Date.now();
      await rendered.sessions[0]?.layout();
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      await rendered.close();
    }
  }, 60_000);
});

// Цвет центра JPEG: картинка рисуется в соседней вкладке, пиксель читается с холста.
async function pixelAtCenter(base64: string): Promise<{ red: number; green: number; blue: number }> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const tab = await browser.newPage();
    const pixel = await tab.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      return Array.from(
        context?.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data ?? [],
      );
    }, base64);
    return { red: pixel[0] ?? 0, green: pixel[1] ?? 0, blue: pixel[2] ?? 0 };
  } finally {
    await browser.close();
  }
}
