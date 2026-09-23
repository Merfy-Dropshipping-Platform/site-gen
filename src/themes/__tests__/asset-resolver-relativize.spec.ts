import { relativizeOwnSiteAssetUrls, resolveAssetUrls } from '../asset-resolver';

// Превью конструктора берёт картинки темы из копии темы, а не с витрины: данные
// конструктора приходят уже разрешёнными на адрес витрины (getRevision), и у
// неопубликованного магазина такая картинка — 404 (замер 23.09, «О нас» bloom).

const SHOP = 'https://shop.merfy.ru';

describe('relativizeOwnSiteAssetUrls', () => {
  it('картинка на витрине этого сайта → корневой путь темы', () => {
    expect(relativizeOwnSiteAssetUrls(`${SHOP}/images/about-photo.webp`, SHOP)).toBe('/images/about-photo.webp');
  });

  it('обратна resolveAssetUrls для ассетов', () => {
    const data = { image: { url: '/images/a.webp' }, icons: ['/icons/x.svg'] };
    expect(relativizeOwnSiteAssetUrls(resolveAssetUrls(data, SHOP), SHOP)).toEqual(data);
  });

  it.each([
    ['маршрут своего сайта', `${SHOP}/catalog`],
    ['загрузка мерчанта (MinIO)', 'https://minio.merfy.ru/uploads/a.webp'],
    ['чужой домен', 'https://other.merfy.ru/images/a.webp'],
    ['уже корневой путь', '/images/a.webp'],
    ['похожий, но другой домен', 'https://shop.merfy.ru.evil.ru/images/a.webp'],
  ])('%s не меняется', (_name, value) => {
    expect(relativizeOwnSiteAssetUrls(value, SHOP)).toBe(value);
  });

  it('вложенные объекты и списки', () => {
    const out = relativizeOwnSiteAssetUrls({ slides: [{ image: `${SHOP}/images/s.png` }], n: 3 }, SHOP);
    expect(out).toEqual({ slides: [{ image: '/images/s.png' }], n: 3 });
  });

  it('адрес сайта со слешем в конце', () => {
    expect(relativizeOwnSiteAssetUrls(`${SHOP}/a.png`, `${SHOP}/`)).toBe('/a.png');
  });

  it('без адреса сайта — данные как есть', () => {
    const data = { url: `${SHOP}/a.png` };
    expect(relativizeOwnSiteAssetUrls(data, null)).toBe(data);
  });
});
