import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPage } from './behaviors-support';

// Увеличение фото товара (блок 15, часть 15в, Р15в-3; design.md блока 6, раздел 8; на проде — wireGalleryZoom и
// openLightbox theme-base Product.astro): hover — scale(2) с точкой под курсором; click — окно с фото и лентой,
// ←/→ без перехода с последнего на первое, Escape, «Закрыть» и фон закрывают, фокус — на рамку.
const zoomBody = (
  mode: string,
  photos: string,
): string => `<merfy-section data-section="shop:product" data-section-id="p1" style="display:block">
  <div data-behavior="zoom" data-mode="${mode}" data-photos="${photos}" id="frame" style="width:400px;height:400px;overflow:hidden">
    <img data-part="image" src="/p/1.jpg" alt="Шарф" id="photo" style="display:block;width:400px;height:400px"></div>
</merfy-section>`;
const PHOTOS = '/p/1.jpg /p/2.jpg /p/3.jpg';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const photoStyle = (page: Page) =>
  page.$eval('#photo', (img) =>
    img instanceof HTMLElement ? { transform: img.style.transform, origin: img.style.transformOrigin } : null,
  );

interface DialogState {
  readonly open: boolean;
  readonly src: string | null;
  readonly thumbs: number;
  readonly current: number;
  readonly animations: number;
}

const dialogOf = (page: Page): Promise<DialogState | null> =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog[data-zoom-dialog]');
    if (!(dialog instanceof HTMLDialogElement)) return null;
    const thumbs = [...dialog.querySelectorAll('[data-zoom-thumb]')];
    return {
      open: dialog.open,
      src: dialog.querySelector('[data-zoom-main]')?.getAttribute('src') ?? null,
      thumbs: thumbs.length,
      current: thumbs.findIndex((thumb) => thumb.getAttribute('aria-current') === 'true'),
      animations: dialog.getAnimations().length,
    };
  });

async function frameBox(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('#frame').boundingBox();
  if (box === null) throw new Error('нет рамки');
  return { x: box.x, y: box.y };
}

describe('zoom: hover', () => {
  it('наведение — scale(2), точка увеличения под курсором; уход — исходный вид; окна нет', async () => {
    const { page } = await openPage(browser, { body: zoomBody('hover', PHOTOS), behaviors: ['zoom'] });
    const box = await frameBox(page);
    await page.mouse.move(box.x + 100, box.y + 200);
    await page.mouse.move(box.x + 100, box.y + 200 + 1);
    await page.mouse.move(box.x + 100, box.y + 200);
    expect(await photoStyle(page)).toEqual({ transform: 'scale(2)', origin: '25% 50%' });
    await page.mouse.move(box.x + 700, box.y + 10);
    expect(await photoStyle(page)).toEqual({ transform: '', origin: '' });
    await page.mouse.click(box.x + 200, box.y + 200);
    expect(await dialogOf(page)).toBeNull();
    await page.close();
  });
});

describe('zoom: click', () => {
  it('нажатие — окно с текущим фото и лентой; ←/→ без перехода с последнего на первое; Escape закрывает', async () => {
    const { page } = await openPage(browser, { body: zoomBody('click', PHOTOS), behaviors: ['zoom'] });
    await page.click('#frame');
    expect(await dialogOf(page)).toMatchObject({ open: true, src: '/p/1.jpg', thumbs: 3, current: 0 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await dialogOf(page)).toMatchObject({ src: '/p/3.jpg', current: 2 });
    await page.keyboard.press('ArrowLeft');
    expect(await dialogOf(page)).toMatchObject({ src: '/p/2.jpg', current: 1 });
    await page.keyboard.press('Escape');
    expect(await dialogOf(page)).toBeNull();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('frame');
    expect(await photoStyle(page)).toEqual({ transform: '', origin: '' });
    await page.close();
  });

  it('окно открывается на фото, которое сейчас в рамке; миниатюра ленты меняет фото; «Закрыть» и фон закрывают', async () => {
    const { page } = await openPage(browser, { body: zoomBody('click', PHOTOS), behaviors: ['zoom'] });
    await page.$eval('#photo', (img) => img.setAttribute('src', '/p/2.jpg'));
    await page.click('#frame');
    expect(await dialogOf(page)).toMatchObject({ src: '/p/2.jpg', current: 1 });
    await page.locator('dialog[data-zoom-dialog] [data-zoom-thumb]').nth(2).click();
    expect(await dialogOf(page)).toMatchObject({ src: '/p/3.jpg', current: 2 });
    await page.click('dialog[data-zoom-dialog] [data-zoom-close]');
    expect(await dialogOf(page)).toBeNull();
    await page.click('#frame');
    await page.mouse.click(5, 5);
    expect(await dialogOf(page)).toBeNull();
    await page.close();
  });

  it('клавиатура: рамка — кнопка «Увеличить фото», Enter открывает окно', async () => {
    const { page } = await openPage(browser, { body: zoomBody('click', PHOTOS), behaviors: ['zoom'] });
    expect(
      await page.$eval('#frame', (el) => [
        el.getAttribute('role'),
        el.getAttribute('tabindex'),
        el.getAttribute('aria-label'),
      ]),
    ).toEqual(['button', '0', 'Увеличить фото']);
    await page.focus('#frame');
    await page.keyboard.press('Enter');
    expect(await dialogOf(page)).toMatchObject({ open: true });
    await page.close();
  });

  it('адреса ленты проверяются как src картинки; одно фото — окно без ленты', async () => {
    const unsafe = await openPage(browser, {
      body: zoomBody('click', '/p/1.jpg javascript:alert(1) /p/2.jpg'),
      behaviors: ['zoom'],
    });
    await unsafe.page.click('#frame');
    expect(await dialogOf(unsafe.page)).toMatchObject({ thumbs: 2 });
    await unsafe.page.close();
    const single = await openPage(browser, { body: zoomBody('click', ''), behaviors: ['zoom'] });
    await single.page.click('#frame');
    expect(await dialogOf(single.page)).toMatchObject({ open: true, src: '/p/1.jpg', thumbs: 0 });
    await single.page.close();
  });

  it('проявление окна — одна анимация; при «уменьшить движение» — сразу, без анимации', async () => {
    const normal = await openPage(browser, { body: zoomBody('click', PHOTOS), behaviors: ['zoom'] });
    await normal.page.click('#frame');
    expect((await dialogOf(normal.page))?.animations).toBe(1);
    await normal.page.close();
    const reduced = await openPage(browser, {
      body: zoomBody('click', PHOTOS),
      behaviors: ['zoom'],
      reducedMotion: true,
    });
    await reduced.page.click('#frame');
    expect((await dialogOf(reduced.page))?.animations).toBe(0);
    await reduced.page.close();
  });
});
