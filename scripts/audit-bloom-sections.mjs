#!/usr/bin/env node
/** Runtime audit: POST /preview/block for Bloom sections not on home seed. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SITE_ID = process.argv[2] ?? '10df1c3a-a1fc-45e0-957a-511c131b1eb8';
const BASE = process.argv[3] ?? 'http://127.0.0.1:3114';
const __dirname = dirname(fileURLToPath(import.meta.url));

const SECTIONS = [
  {
    type: 'Collections',
    marker: 'data-puck-component-id',
    props: { id: 'audit-collections', heading: 'AUDIT Коллекции', cards: 3, columns: 3 },
  },
  {
    type: 'ImageWithText',
    marker: 'AUDIT IWT',
    props: {
      id: 'audit-iwt',
      heading: 'AUDIT IWT',
      text: 'AUDIT текст блока',
      image: { url: '/placeholders/landscape-iwt.png', alt: '' },
    },
  },
  {
    type: 'MultiRows',
    marker: 'AUDIT MR',
    props: { id: 'audit-mr', heading: 'AUDIT MR', buttonStyle: 'secondary' },
  },
  {
    type: 'CollapsibleSection',
    marker: 'AUDIT FAQ',
    props: {
      id: 'audit-faq',
      heading: 'AUDIT FAQ',
      sections: [{ title: 'Q1', content: 'A1' }],
    },
  },
  {
    type: 'Newsletter',
    marker: 'AUDIT NL',
    props: { id: 'audit-nl', heading: 'AUDIT NL', alignment: 'center' },
  },
  {
    type: 'Slideshow',
    marker: 'data-puck-component-id',
    props: {
      id: 'audit-slideshow',
      slides: [{ image: { url: '/placeholders/landscape-image.png', alt: '' }, heading: 'S1' }],
    },
  },
  {
    type: 'Publications',
    marker: 'AUDIT PUB',
    props: { id: 'audit-pub', heading: 'AUDIT PUB', cardsCount: 2, columnsCount: 2 },
  },
  {
    type: 'Video',
    marker: 'AUDIT VID',
    props: { id: 'audit-vid', heading: 'AUDIT VID', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  },
  {
    type: 'ContactForm',
    marker: 'AUDIT CF',
    props: { id: 'audit-cf', heading: 'AUDIT CF' },
  },
  {
    type: 'CartSection',
    marker: 'Корзина',
    props: { id: 'audit-cart', padding: { top: 40, bottom: 40 } },
  },
];

async function auditOne(section) {
  const url = `${BASE.replace(/\/$/, '')}/api/sites/${SITE_ID}/preview/block`;
  const body = { blockType: section.type, themeId: 'bloom', props: section.props };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const html = await res.text();
    const err = html.includes('data-render-error') || html.includes('data-missing-block');
    const ok = res.ok && !err && html.includes(section.marker);
    return {
      type: section.type,
      status: ok ? 'OK' : err ? 'BROKEN' : 'WARN',
      http: res.status,
      bytes: html.length,
      marker: section.marker,
      found: html.includes(section.marker),
      snippet: html.slice(0, 120).replace(/\s+/g, ' '),
    };
  } catch (e) {
    return { type: section.type, status: 'FAIL', error: String(e) };
  }
}

console.log(`Auditing ${SECTIONS.length} Bloom sections → ${BASE}\n`);
const results = [];
for (const s of SECTIONS) {
  const r = await auditOne(s);
  results.push(r);
  const icon = r.status === 'OK' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} ${r.type}: ${r.status}${r.http ? ` (${r.http}, ${r.bytes}b, marker=${r.found})` : ''}${r.error ? ` — ${r.error}` : ''}`);
}

const ok = results.filter((r) => r.status === 'OK').length;
console.log(`\n${ok}/${results.length} OK`);
