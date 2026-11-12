// Раскадровка в настоящем Chromium (часть 3в). Страница-фикстура повторяет поведение ядра витрины: в режиме превью
// появления не играют, в режиме витрины с `data-motion-reveal="on"` элемент прячется и играет `Element.animate` при входе в
// экран (как `behaviors/reveal.ts` + `motion/mini`). Пропускается, если браузера Playwright нет.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { ChromiumRenderer } from '../src/look/look-browser';
import { LOOK_PATTERN, runLookJob } from '../src/look/look-job';

const hasChromium = existsSync(chromium.executablePath());

const CONFIG = JSON.stringify({
  v: 1,
  mode: 'preview',
  shop: { id: 's1', name: 'Магазин', url: 'https://shop.example.test' },
  analytics: null,
  page: { id: 'home', path: '/' },
});

// Три секции по 700 px: у первой и второй своя анимация, у третьей — нет. Вторая — ниже первого экрана.
const FIXTURE = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<script id="merfy-config" type="application/json">${CONFIG}</script>
<style>body{margin:0;font-family:sans-serif}merfy-section{display:block;height:700px;padding:40px;box-sizing:border-box}
.card{width:300px;height:200px;background:#c0392b}</style></head><body>
<merfy-section data-section-id="hero-1" data-section="hero"><div class="card" data-animate="fade-up"></div></merfy-section>
<merfy-section data-section-id="gallery-2" data-section="gallery"><div class="card" data-animate="fade-up" style="background:#2471a3"></div></merfy-section>
<merfy-section data-section-id="text-3" data-section="text"><p>Просто текст</p></merfy-section>
<script>
const config = JSON.parse(document.getElementById('merfy-config').textContent);
const on = document.documentElement.getAttribute('data-motion-reveal') === 'on';
if (config.mode === 'live' && on) {
  const play = (node) => node.animate(
    [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }],
    { duration: 600, delay: 100, easing: 'ease-out', fill: 'both' },
  );
  for (const node of document.querySelectorAll('[data-animate]')) {
    node.style.opacity = '0';
    new IntersectionObserver((entries, observer) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      play(node).finished.then(() => { node.style.opacity = ''; });
    }).observe(node);
  }
}
</script></body></html>`;

const isJpeg = (bytes: Uint8Array): boolean => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.length > 500;

describe.skipIf(!hasChromium)('раскадровка · настоящий Chromium', () => {
  const renderer = new ChromiumRenderer();
  afterAll(() => renderer.close(), 30_000);

  const look = async (data: Record<string, unknown>, html = FIXTURE) => {
    const reply = await runLookJob(
      {
        renderer,
        fetch: () => Promise.resolve(new Response(html, { headers: { 'content-type': 'text/html' } })),
        sitesUrl: 'http://sites',
        log: () => undefined,
        now: () => Date.now(),
      },
      {
        pattern: LOOK_PATTERN,
        data: {
          v: 1,
          siteId: 's1',
          page: 'home',
          devices: 'desktop',
          full: false,
          deadline: Date.now() + 55_000,
          ...data,
        },
      },
    );
    if (!reply.ok) throw new Error(reply.error.message);
    return reply.snapshot;
  };

  it('кадры 0/200/400/800 мс разные, список анимаций с пресетом и длительностью, появления включены принудительно', async () => {
    const snapshot = await look({ motion: true });
    if (!snapshot.motion?.ok) throw new Error(snapshot.motion?.reason ?? 'нет раскадровки');
    const { motion } = snapshot;

    expect(motion.device).toBe('desktop');
    expect(motion.revealForced).toBe(true);
    expect(motion.animations).toEqual([
      {
        section: 'hero-1',
        type: 'hero',
        preset: 'fade-up',
        durationMs: 600,
        delayMs: 100,
        spanMs: 0,
        elements: 1,
        loop: false,
      },
      {
        section: 'gallery-2',
        type: 'gallery',
        preset: 'fade-up',
        durationMs: 600,
        delayMs: 100,
        spanMs: 0,
        elements: 1,
        loop: false,
      },
    ]);
    expect(motion.skipped).toBe(0);
    expect(motion.sections.map((entry) => entry.section)).toEqual(['hero-1', 'gallery-2']);
    for (const entry of motion.sections) {
      expect(entry.frames.map((frame) => frame.at)).toEqual([0, 200, 400, 800]);
      const bytes = entry.frames.map((frame) => Buffer.from(frame.image, 'base64'));
      for (const frame of bytes) expect(isJpeg(frame)).toBe(true);
      // Движение видно: кадры по времени различаются, а первый и последний — сильнее всего (карточка выезжает).
      expect(new Set(entry.frames.map((frame) => frame.image)).size).toBe(4);
      expect(bytes[0]?.equals(bytes[3] ?? Buffer.alloc(0))).toBe(false);
    }
  }, 60_000);

  it('без motion второй страницы нет: поля в снимке нет', async () => {
    expect((await look({})).motion).toBeUndefined();
  }, 60_000);

  it('страница кабинета: кадров нет, причина словами, снимок цел', async () => {
    const cabinet = FIXTURE.replace('"id":"home"', '"id":"page-orders"');
    const snapshot = await look({ motion: true }, cabinet);
    expect(snapshot.motion).toMatchObject({ ok: false });
    expect(snapshot.devices[0]?.images).toHaveLength(1);
  }, 60_000);
});
