// Стенд vanilla для реестра. Пропсы МИНИМАЛЬНЫЕ — зеркалят сид rose
// (packages/theme-rose/pages/home.json): реестр меряет МЕХАНИЗМ настроек,
// поэтому блок должен стартовать из состояния «вёрстка как есть», а не из
// богатой пилотной композиции.
// `_vanillaHomeMigrationVersion` выставлен в актуальную версию, иначе
// migrateVanillaHomePage перезаписывает home на КАЖДОМ чтении.
import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';
import { VANILLA_HOME_MIGRATION_VERSION } from '../src/utils/revision-migrations';

const [tenantId, siteId] = process.argv.slice(2);
if (!tenantId || !siteId) { console.error('usage: _vanilla-stand-seed.ts <tenantId> <siteId>'); process.exit(2); }

const ROSE_HERO_IMG = 'https://minio.merfy.ru/product-images/c02b5c8c-6b9b-4f32-9edb-7df26a953236.png';
const ROSE_GALLERY = [
  { id: 'item-1', type: 'image', url: 'https://minio.merfy.ru/product-images/72b8fafa-5500-4547-b8c8-b1aeede1abe7.webp', alt: 'Изображение' },
  { id: 'item-2', type: 'image', url: 'https://minio.merfy.ru/product-images/1352e026-ad8e-40e0-82ea-313f6d28f0a8.webp', alt: 'Изображение' },
];

const blocks = [
  { type: 'PromoBanner', props: { id: 'PromoBanner-home' } },
  { type: 'Header', props: { id: 'Header-home', navigationLinks: [
    { label: 'Каталог', href: '/catalog' }, { label: 'О нас', href: '/about' },
    { label: 'Доставка', href: '/delivery' }, { label: 'Контакты', href: '/contacts' },
  ] } },
  { type: 'Hero', props: { id: 'Hero-home', backgroundImages: { url1: ROSE_HERO_IMG } } },
  { type: 'Collections', props: { id: 'Collections-home' } },
  { type: 'PopularProducts', props: { id: 'PopularProducts-home' } },
  { type: 'ImageWithText', props: { id: 'ImageWithText-home' } },
  { type: 'Gallery', props: { id: 'Gallery-home', items: ROSE_GALLERY } },
  { type: 'Footer', props: { id: 'Footer-home' } },
];

// Доп-страницы стенда: каталог / товар / корзина берутся из канонических
// сидов темы как есть (реестр меряет механизм, не композицию).
import { readFileSync } from 'node:fs';
const seedPage = (name: string) => {
  // запуск из корня воркtree (см. README реестра)
  const raw = JSON.parse(readFileSync(`packages/theme-vanilla/pages/${name}.json`, 'utf-8'));
  return { root: { props: {} }, zones: {}, content: raw.content };
};

async function main() {
  const data = {
    pages: [
      { id: 'home', name: 'Главная', slug: '/' },
      { id: 'page-catalog', name: 'Каталог', slug: '/catalog' },
      { id: 'page-product', name: 'Товар', slug: '/product' },
      { id: 'page-cart', name: 'Корзина', slug: '/cart' },
    ],
    pagesData: {
      home: { root: { props: { title: 'Главная' } }, zones: {}, content: blocks },
      'page-catalog': seedPage('catalog'),
      'page-product': seedPage('product'),
      'page-cart': seedPage('cart'),
      _vanillaHomeMigrationVersion: VANILLA_HOME_MIGRATION_VERSION,
    },
    currentPageId: 'home',
    themeSettings: {},
  };
  console.log('состав стенда:', blocks.map((b) => b.type).join(' -> '));
  const conn = await amqplib.connect(process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:password@localhost:5672');
  const ch = await conn.createChannel();
  const { queue: replyTo } = await ch.assertQueue('', { exclusive: true });
  const correlationId = randomUUID();
  const answer = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('RPC timeout 45s')), 45000);
    ch.consume(replyTo, (m) => { if (m?.properties.correlationId === correlationId) { clearTimeout(t); res(JSON.parse(m.content.toString())); } }, { noAck: true });
  });
  ch.sendToQueue('sites_queue', Buffer.from(JSON.stringify({
    pattern: 'sites.revisions.create',
    data: { tenantId, siteId, data, setCurrent: true, actorUserId: 'theme-registry-seed' },
    id: correlationId,
  })), { correlationId, replyTo });
  console.log(JSON.stringify(await answer, null, 2));
  await conn.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
