// Сидинг 60 тестовых товаров для flux-сайта 10caf133 через прямой Product Service :3113
// (gateway заблокирован paywall — аккаунт frozen). Товары с вариантами (Цвет→свотчи,
// Память/Размер→чипы), скидками (compareAtPrice), частью недоступных вариантов (qty=0 → приглушение),
// привязкой к коллекциям. Идемпотентно: пропускает товары с уже существующим title.
// Запуск:  node .tmp-seed-flux-products.cjs

// Storefront-канон: товары storefront хранятся под shopId = siteId (НЕ tenantId).
// build.service:875 инжектит shopId=siteId в HTML, storefront-data.controller:169 shopId=siteId,
// /catalog client дёргает /api/store/products?store_id=siteId. Под tenantId storefront НЕ видит.
const SHOP = '10caf133-cb75-4bb9-875e-a429b201b8a7'; // siteId сайта flux
const BASE = `http://176.57.218.121:3113/${SHOP}`;
const CAT_ELEC = 'be839d8c-87da-45d5-9200-5368b96ebe68';
const CAT_CLOTH = 'c5dbed4f-2c62-42f9-9557-fa837e092c83';

// ЖИВЫЕ картинки из bucket (mc ls → HTTP 200). Файл /tmp/bucket-live.txt = имена объектов.
const fs = require('fs');
const IMAGES = fs.readFileSync('/tmp/bucket-live.txt', 'utf8').trim().split('\n')
  .filter(Boolean).map((u) => `https://minio.merfy.ru/product-images/${u.trim()}`);

const COLORS = [
  ['Чёрный', '#1a1a1a'], ['Белый', '#f5f5f5'], ['Синий', '#1e3a8a'],
  ['Титан', '#9ca3af'], ['Зелёный', '#1e5631'], ['Красный', '#b91c1c'],
  ['Золотой', '#d4af37'], ['Розовый', '#ec9bb6'],
];

// Группы: имя коллекции → {категория, модификатор(название группы + значения), товары[name,basePrice₽], colorsCount}
const GROUPS = [
  { coll: 'Смартфоны', cat: CAT_ELEC, modName: 'Память', mods: ['128 ГБ','256 ГБ','512 ГБ','1 ТБ'], colors: 4, items: [
    ['M Phone 17', 140990], ['M Phone 17 Pro', 165970], ['M Phone 17 Pro Max', 189990],
    ['M Phone 16', 104990], ['M Phone 16 Pro', 129990], ['M Phone 16e', 74990],
    ['M Phone 15', 89990], ['M Phone 15 Plus', 99990], ['M Phone 14', 79990],
    ['M Phone 14 Pro', 94990], ['M Phone 13', 64990], ['M Phone SE', 54990],
  ]},
  { coll: 'Наушники и аудио', cat: CAT_ELEC, modName: null, mods: null, colors: 3, items: [
    ['M Buds 3', 18990], ['M Buds Pro 2', 24990], ['M Headphones 2s', 20990],
    ['M Headphones Max', 59990], ['M Buds 2', 12990], ['M Buds SE', 8990],
    ['M Speaker Mini', 9990], ['M Speaker Pro', 34990], ['M Earphones', 4990],
  ]},
  { coll: 'Ноутбуки', cat: CAT_ELEC, modName: 'Накопитель', mods: ['256 ГБ','512 ГБ','1 ТБ','2 ТБ'], colors: 3, items: [
    ['M Book Air 13', 109990], ['M Book Air 15', 129990], ['M Book Pro 14', 199990],
    ['M Book Pro 16', 269990], ['M Book Pro 13', 149990], ['M Book SE', 89990],
    ['M Station', 349990],
  ]},
  { coll: 'Умные часы', cat: CAT_ELEC, modName: 'Размер', mods: ['41 мм','45 мм'], colors: 4, items: [
    ['M Watch S10', 39990], ['M Watch Ultra 3', 89990], ['M Watch SE', 24990],
    ['M Watch S9', 34990], ['M Watch S8', 29990], ['M Watch Ultra 2', 79990],
    ['M Band 9', 19990],
  ]},
  { coll: 'Планшеты', cat: CAT_ELEC, modName: 'Память', mods: ['128 ГБ','256 ГБ','512 ГБ'], colors: 3, items: [
    ['M Pad Air', 59990], ['M Pad Pro 11', 99990], ['M Pad Pro 13', 129990],
    ['M Pad mini', 49990], ['M Pad 11', 39990], ['M Pad SE', 34990],
    ['M Pad Pro M4', 139990],
  ]},
  { coll: 'Аксессуары', cat: CAT_ELEC, modName: null, mods: null, colors: 3, items: [
    ['Чехол M Phone 17', 4990], ['Зарядка 30W', 3990], ['Кабель USB-C', 1990],
    ['MagPad', 4490], ['Адаптер USB-C', 2990], ['Powerbank 10000', 5990],
    ['Док-станция', 9990], ['Подставка M Stand', 6990], ['AirTag M', 3490],
  ]},
  { coll: 'Куртки', cat: CAT_CLOTH, modName: 'Размер', mods: ['S','M','L','XL'], colors: 4, items: [
    ['Куртка Arctic', 14990], ['Куртка Urban', 9990], ['Пуховик North', 24990],
    ['Парка Storm', 19990], ['Ветровка Light', 7990],
  ]},
  { coll: 'Кроссовки', cat: CAT_CLOTH, modName: 'Размер', mods: ['39','40','41','42','43'], colors: 3, items: [
    ['Кроссовки Runner', 12990], ['Кроссовки Street', 9990], ['Кеды Classic', 6990],
    ['Кроссовки Trail', 15990],
  ]},
];

let imgIdx = 0;
const pic = () => IMAGES[imgIdx++ % IMAGES.length];
const kop = (rub) => Math.round(rub) * 100; // рубли → копейки

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = txt; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  return json;
}

async function main() {
  // Существующие товары/коллекции (идемпотентность)
  const existProds = await api('GET', '/products?limit=500').catch(() => ({ items: [] }));
  const existList = existProds.items || existProds.data || existProds || [];
  const existByTitle = new Map((Array.isArray(existList) ? existList : []).map((p) => [p.title, p]));
  const existColls = await api('GET', '/collections').catch(() => []);
  const collList = Array.isArray(existColls) ? existColls : (existColls.items || existColls.data || []);
  const collByName = new Map(collList.map((c) => [c.name, c.id]));
  console.log(`Старт: ${existByTitle.size} товаров уже есть, ${collByName.size} коллекций.`);

  let created = 0, skipped = 0, withDiscount = 0;
  const summary = [];

  for (const g of GROUPS) {
    // коллекция
    let collId = collByName.get(g.coll);
    if (!collId) {
      const c = await api('POST', '/collections', { name: g.coll });
      collId = c.id || c.data?.id;
      collByName.set(g.coll, collId);
      console.log(`+ коллекция «${g.coll}» (${collId})`);
    }
    const palette = COLORS.slice(0, g.colors);

    for (let i = 0; i < g.items.length; i++) {
      const [name, priceRub] = g.items[i];

      // ~45% товаров со скидкой
      const hasDiscount = ((i * 7 + g.coll.length) % 100) < 45;
      const base = kop(priceRub);
      const compare = hasDiscount ? kop(Math.round(priceRub * (1.15 + (i % 4) * 0.07))) : undefined;

      // Разная картинка на КАЖДЫЙ цвет → свотч-клик в каталоге переключает фото (flux-фича).
      const colorImgs = palette.map(() => pic());
      const variantGroups = [
        { name: 'Цвет', options: palette.map(([v, hex], ci) => ({ value: v, swatchHex: hex, images: [colorImgs[ci]] })) },
      ];
      if (g.mods) variantGroups.push({ name: g.modName, options: g.mods.map((v) => ({ value: v })) });

      // товар: существующий (дополнить) или новый
      let pid, opts, existedVariants = 0, isNew = true;
      const ex = existByTitle.get(name);
      if (ex) {
        isNew = false;
        pid = ex.id;
        const full = await api('GET', `/products/${pid}`).catch(() => ({}));
        opts = full.options || [];
        existedVariants = full.totalVariants || 0;
      } else {
        const prod = await api('POST', '/products', {
          title: name, categoryId: g.cat,
          description: `${name} — тестовый товар коллекции «${g.coll}».`,
          basePrice: base, ...(compare ? { compareAtPrice: compare } : {}),
          images: [colorImgs[0]], hasVariants: true, status: 'active', variantGroups,
        });
        pid = prod.id;
        opts = prod.options || [];
        if (hasDiscount) withDiscount++;
      }
      const colorVals = (opts.find((o) => o.name === 'Цвет') || {}).values || [];
      const modVals = g.modName ? ((opts.find((o) => o.name === g.modName) || {}).values || []) : [null];

      // комбинации только если их ещё нет (каждый ~4-й qty=0 → приглушение чипа). SKU не задаём (auto/null).
      let combs = 0;
      if (existedVariants === 0 && colorVals.length) {
        const combinations = [];
        let n = 0;
        for (const cv of colorVals) {
          for (const mv of modVals) {
            const optionIds = mv ? [cv.id, mv.id] : [cv.id];
            const unavailable = (n % 4 === 3);
            combinations.push({
              optionIds, price: base,
              ...(compare ? { compareAtPrice: compare } : {}),
              quantity: unavailable ? 0 : (10 + (n % 5) * 5),
            });
            n++;
          }
        }
        if (combinations.length) await api('POST', `/products/${pid}/variants`, { combinations });
        combs = combinations.length;
      }
      // привязать к коллекции (идемпотентно — повтор безвреден)
      await api('POST', `/collections/${collId}/products`, { productIds: [pid] }).catch(() => {});

      if (isNew) created++; else skipped++;
      summary.push(`${isNew ? '+' : '~'} ${name} | ${priceRub}₽${compare ? ` (старая ${compare / 100}₽)` : ''} | ${g.coll} | ${colorVals.length}цв×${modVals.filter(Boolean).length || 0}мод ${combs ? `= ${combs}комб` : '(комб были)'}`);
      if ((created + skipped) % 10 === 0) console.log(`  ...${created + skipped} обработано`);
    }
  }

  console.log('\n=== ИТОГ ===');
  console.log(`Создано: ${created} | Пропущено(дубли): ${skipped} | Со скидкой: ${withDiscount}`);
  console.log(`Коллекций: ${collByName.size}`);
  console.log('\n--- Товары ---');
  summary.forEach((s) => console.log('  ' + s));
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
