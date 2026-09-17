import { migrateRevisionData } from '../revision-migrations';

/**
 * Баг владельца 17.09.2026: «Слайд-шоу — не применяется медиафайл в слайде».
 *
 * `clearDemoImageSections` (revision-migrations.ts) сносит ВЕСЬ контент
 * декоративной секции (Hero/MultiRows/ImageWithText/Gallery/Slideshow/Video/
 * MultiColumns/Collections), если где-то внутри props ЕЩЁ остался известный
 * демо-адрес сида — так отличают нетронутую секцию от секции, которую
 * мерчант заполнил своим фото, чтобы показать Figma-плейсхолдер вместо
 * стоковой картинки.
 *
 * Слайд-шоу — МАССИВ до 5 независимых слайдов. Мерчант обычно правит ОДИН
 * слайд и оставляет остальные на сиде. Старая проверка смотрела на props
 * ЦЕЛИКОМ («есть ли где-нибудь демо-адрес») — и если хотя бы один слайд ещё
 * не тронут, удаляла `slides` ПОЛНОСТЬЮ, включая только что выбранное фото
 * мерчанта в СОСЕДНЕМ слайде. Ровно так и выглядел баг: выбираешь картинку —
 * а на сайте либо старое стоковое фото, либо пустой Figma-плейсхолдер.
 *
 * Замер до фикса (см. отчёт): node -e миграция на props с 2 слайдами (один
 * демо-URL из DEMO_IMAGE_URLS, другой — реальный merchant upload) вернула
 * props БЕЗ ключа `slides` вовсе. После фикса `slides` сохраняется целиком.
 */
describe('clearDemoImageSections — партиальная правка Slideshow не должна сносить чужой слайд', () => {
  const DEMO_URL =
    'https://minio.merfy.ru/product-images/113f237c-bc9d-4026-940f-362c34d5edef.png';
  const MERCHANT_URL = 'https://minio.merfy.ru/site-assets/merchant-chosen.jpg';

  const runSlideshow = (slides: unknown[]) =>
    migrateRevisionData({
      pagesData: {
        home: {
          content: [
            {
              type: 'Slideshow',
              props: {
                id: 'Slideshow-1',
                slides,
                interval: 5,
                autoplay: true,
                padding: { top: 80, bottom: 80 },
              },
            },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };

  it('слайд с фото мерчанта выживает, даже если сосед ещё на демо-фото сида', () => {
    const out = runSlideshow([
      { id: 'slide-1', image: DEMO_URL, heading: 'Слайд-шоу' },
      { id: 'slide-2', image: MERCHANT_URL, heading: 'Мой заголовок' },
    ]);
    const slideshowProps = out.pagesData.home.content[0].props;
    expect(slideshowProps.slides).toBeDefined();
    expect(slideshowProps.slides).toHaveLength(2);
    expect(slideshowProps.slides[1].image).toBe(MERCHANT_URL);
    // Нетронутый сосед остаётся как есть — это ожидаемое поведение (мерчант
    // его ещё не трогал), а не "потерялся".
    expect(slideshowProps.slides[0].image).toBe(DEMO_URL);
  });

  it('полностью нетронутая секция (оба слайда — демо) по-прежнему уходит в Figma-плейсхолдер', () => {
    const out = runSlideshow([
      { id: 'slide-1', image: DEMO_URL, heading: 'Слайд-шоу' },
      {
        id: 'slide-2',
        image:
          'https://minio.merfy.ru/product-images/1352e026-ad8e-40e0-82ea-313f6d28f0a8.webp',
        heading: 'Слайд-шоу',
      },
    ]);
    const slideshowProps = out.pagesData.home.content[0].props;
    expect(slideshowProps.slides).toBeUndefined();
  });

  it('unsplash демо-фото (satin) в одном слайде тоже не должно сносить фото мерчанта в другом', () => {
    const out = runSlideshow([
      {
        id: 'slide-1',
        image: 'https://images.unsplash.com/photo-demo-cover',
        heading: 'Слайд-шоу',
      },
      { id: 'slide-2', image: MERCHANT_URL, heading: 'Мой заголовок' },
    ]);
    const slideshowProps = out.pagesData.home.content[0].props;
    expect(slideshowProps.slides).toBeDefined();
    expect(slideshowProps.slides[1].image).toBe(MERCHANT_URL);
  });
});
