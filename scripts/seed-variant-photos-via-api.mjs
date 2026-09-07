#!/usr/bin/env node
// Локально: 6 фото на товар и на каждый вариант через gateway API
// (upload MinIO → PATCH images → PUT variants/sync). Прод не трогает.
//
//   node scripts/seed-variant-photos-via-api.mjs
import zlib from 'node:zlib';
import { crc32 } from 'node:zlib';

const API = process.env.API_BASE || 'http://localhost:3110';
// Креды берём ТОЛЬКО из окружения — в репозитории их держать нельзя.
const EMAIL = process.env.MERFY_EMAIL;
const PASSWORD = process.env.MERFY_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Задайте MERFY_EMAIL и MERFY_PASSWORD в окружении.');
  process.exit(1);
}
const SHOPS = (
  process.env.SHOP_IDS ||
  '132d3a3e-a28f-40b7-98fa-a0200151cfb8,e03dd420-febf-4499-9fc4-992412cc1b99'
).split(',').map((s) => s.trim()).filter(Boolean);
const PER = 6;

const jar = [];

function cookieHeader() {
  return jar.map(([k, v]) => `${k}=${v}`).join('; ');
}

function captureCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const sc of raw) {
    const first = sc.split(';')[0];
    const eq = first.indexOf('=');
    if (eq < 0) continue;
    const name = first.slice(0, eq);
    const value = first.slice(eq + 1);
    const i = jar.findIndex(([k]) => k === name);
    if (i >= 0) jar[i] = [name, value];
    else jar.push([name, value]);
  }
}

async function api(method, path, { query, json, form } = {}) {
  let url = `${API}${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers = { accept: 'application/json' };
  if (jar.length) headers.cookie = cookieHeader();
  const init = { method, headers };
  if (form) {
    init.body = form;
  } else if (json !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  const res = await fetch(url, init);
  captureCookies(res);
  const text = await res.text();
  let body = text;
  try { body = text ? JSON.parse(text) : {}; } catch { /* raw */ }
  if (!res.ok) {
    const snippet = typeof body === 'string' ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400);
    throw new Error(`${method} ${path} → ${res.status} ${snippet}`);
  }
  return body;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(r, g, b, size = 48) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      const edge = x < 4 || y < 4 || x >= size - 4 || y >= size - 4;
      raw[i] = edge ? Math.max(0, r - 40) : r;
      raw[i + 1] = edge ? Math.max(0, g - 40) : g;
      raw[i + 2] = edge ? Math.max(0, b - 40) : b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hueRgb(h) {
  const s = 0.55, l = 0.58;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
}

function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

async function uploadPngs(shopId, buffers, prefix) {
  const form = new FormData();
  buffers.forEach((buf, i) => {
    const blob = new Blob([buf], { type: 'image/png' });
    form.append('images', blob, `${prefix}-${i + 1}.png`);
  });
  const res = await api('POST', '/api/products/upload/images', {
    query: { shopId },
    form,
  });
  const urls = res.urls || res.data?.urls || res.data || [];
  if (!Array.isArray(urls) || urls.length !== buffers.length) {
    throw new Error(`upload ${prefix}: expected ${buffers.length} urls, got ${JSON.stringify(res).slice(0, 300)}`);
  }
  return urls;
}

function sixBuffers(seed) {
  const base = hashHue(seed);
  return Array.from({ length: PER }, (_, i) => {
    const [r, g, b] = hueRgb((base + i * 28) % 360);
    return makePng(r, g, b);
  });
}

function unwrapProduct(res) {
  return res.data || res.product || res;
}

function listItems(res) {
  const d = res.data ?? res;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.products)) return d.products;
  return [];
}

async function seedShop(shopId) {
  console.log(`\nshop ${shopId}`);
  const listed = await api('GET', '/api/products', { query: { shopId, take: '200' } });
  const items = listItems(listed);
  console.log(`  товаров: ${items.length}`);
  let nGallery = 0, nVariant = 0, nSkip = 0;
  for (const row of items) {
    const id = row.id;
    const title = row.title || row.name || id;
    const full = unwrapProduct(await api('GET', `/api/products/${id}`, { query: { shopId } }));
    const gallery = await uploadPngs(shopId, sixBuffers(`${id}:gallery`), `${id}-gal`);
    await api('PATCH', `/api/products/${id}`, { query: { shopId }, json: { images: gallery } });
    nGallery += 1;

    const groups = full.options || full.variantGroups || [];
    const variants = full.variants || full.variantCombinations || [];
    if (!full.hasVariants || !groups.length) {
      console.log(`  · ${title} — 6 фото галереи (без вариантов)`);
      continue;
    }

    const optionUrls = new Map();
    const variantGroups = [];
    for (const g of groups) {
      const optsIn = g.values || g.options || [];
      const optsOut = [];
      for (let i = 0; i < optsIn.length; i++) {
        const opt = optsIn[i];
        const value = opt.value || opt.name;
        const urls = await uploadPngs(shopId, sixBuffers(`${id}:${g.name}:${value}`), `${id}-${g.name}-${value}`);
        optionUrls.set(`${g.name}::${value}`, urls);
        const o = { value, position: opt.position ?? i, images: urls };
        if (opt.swatchHex && /^#[0-9A-Fa-f]{6}$/.test(opt.swatchHex)) o.swatchHex = opt.swatchHex;
        optsOut.push(o);
      }
      variantGroups.push({ name: g.name, position: g.position ?? 0, options: optsOut });
    }

    const combinationOverrides = variants.map((v) => {
      const optionValues = v.options || v.optionValues || {};
      const colorKey = Object.keys(optionValues).find((k) => /цвет|color/i.test(k)) || Object.keys(optionValues)[0];
      const colorVal = colorKey ? optionValues[colorKey] : null;
      const images = (colorVal && optionUrls.get(`${colorKey}::${colorVal}`)) || gallery;
      const o = { optionValues, images };
      if (v.price != null) o.price = Number(v.price);
      if (v.compareAtPrice != null) o.compareAtPrice = Number(v.compareAtPrice);
      if (v.costPrice != null) o.costPrice = Number(v.costPrice);
      if (v.quantity != null) o.quantity = Number(v.quantity);
      if (v.sku) o.sku = v.sku;
      if (typeof v.allowBackorder === 'boolean') o.allowBackorder = v.allowBackorder;
      return o;
    });

    await api('PUT', `/api/products/${id}/variants/sync`, {
      query: { shopId },
      json: { variantGroups, combinationOverrides },
    });
    nVariant += 1;
    console.log(`  · ${title} — 6 галерея + ${optionUrls.size} опций × 6`);
  }
  return { nGallery, nVariant, nSkip, total: items.length };
}

console.log(`API ${API}\nlogin ${EMAIL}`);
await api('POST', '/api/auth/sign-in/email', { json: { email: EMAIL, password: PASSWORD } });
if (!jar.length) throw new Error('логин не дал cookie');
console.log('session ok');

const summary = [];
for (const shopId of SHOPS) {
  summary.push({ shopId, ...(await seedShop(shopId)) });
}
console.log('\nготово');
for (const s of summary) {
  console.log(`  ${s.shopId}: gallery=${s.nGallery} withVariants=${s.nVariant} / ${s.total}`);
}
