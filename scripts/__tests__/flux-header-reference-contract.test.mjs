import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const home = JSON.parse(
  await fs.readFile(
    path.join(root, 'packages/theme-flux/pages/home.json'),
    'utf8',
  ),
);
const headerSource = await fs.readFile(
  path.join(root, 'themes/flux/src/components/Header.astro'),
  'utf8',
);
const promoSource = await fs.readFile(
  path.join(root, 'themes/flux/src/components/sections/PromoBanner.astro'),
  'utf8',
);
const theme = JSON.parse(
  await fs.readFile(
    path.join(root, 'packages/theme-flux/theme.json'),
    'utf8',
  ),
);

const block = (type) => home.content.find((item) => item.type === type);

test('Flux seed reproduces the designer promo and header content', () => {
  const promo = block('PromoBanner');
  const header = block('Header');

  assert.deepEqual(promo?.props, {
    id: 'PromoBanner-home',
    text: 'Бесплатная доставка на весь ассортимент до 31.12.2026.',
    link: {
      text: 'Смотреть больше',
      href: '/catalog',
    },
    size: 'large',
    textTransform: 'uppercase',
  });

  assert.deepEqual(header?.props?.padding, { top: 12, bottom: 12 });
  assert.equal(header?.props?.stickiness, 'always');
  assert.equal(
    header?.props?.colorScheme,
    'scheme-1',
    'the local constructor palette maps scheme-1 to the designer white header',
  );
  assert.ok(
    !header?.props?.menuColorScheme,
    'the designer navigation inherits the white Header scheme',
  );
  assert.deepEqual(header?.props?.navigationLinks, [
    { label: 'Главная', href: '/' },
    { label: 'Полноразмерные наушники', href: '/catalog/naushniki' },
    { label: 'TWS-наушники с кейсом', href: '/catalog/tws' },
    { label: 'Портативные колонки', href: '/catalog/kolonki' },
    { label: 'Саундбары', href: '/catalog/saundbary' },
  ]);
});

test('Flux Header keeps the designer 44px action hit areas', () => {
  const size11 = headerSource.match(
    /class="(?:relative )?flex size-11 items-center justify-center/g,
  );

  assert.ok(
    (size11?.length ?? 0) >= 8,
    'mobile and all desktop layouts must retain size-11 action containers',
  );
  assert.doesNotMatch(
    headerSource,
    /class="(?:relative )?flex size-8 items-center justify-center/,
  );
  assert.match(headerSource, /bg-\[#1e2952\]/);
  assert.doesNotMatch(headerSource, /bg-\[#FA5109\]/);
});

test('Flux promo defaults to designer navy but remains scheme-configurable', () => {
  assert.ok(
    !theme.blockDefaults?.PromoBanner?.colorScheme,
    'default Flux promo must use its designer baseline until merchant selects a scheme',
  );
  assert.match(promoSource, /p\.colorScheme/);
  assert.match(promoSource, /bg-\[#1e2952\]/);
  assert.match(promoSource, /text-white/);
  assert.match(promoSource, /bg-\[rgb\(var\(--color-bg\)\)\]/);
  assert.match(
    promoSource,
    /"text-\[12px\] md:text-\[16px\]"/,
    'large promo text must stay inside the 48px designer bar on mobile',
  );
  assert.match(
    promoSource,
    /: "h-12";/,
    'large promo must keep the designer fixed 48px height',
  );
});
