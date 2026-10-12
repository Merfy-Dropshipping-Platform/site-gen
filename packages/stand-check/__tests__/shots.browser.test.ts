import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packagePath } from '../src/paths';
import { takeShots } from '../src/shots/shots';
import { serveFolder, type StaticServer } from './support/static-server';

// Снимки тестовой страницы fixtures/test-page на двух ширинах; страница, которая не ответила 200, — без снимка.
let server: StaticServer;

beforeAll(async () => {
  server = await serveFolder(packagePath('fixtures/test-page'));
});

afterAll(async () => {
  await server.close();
});

describe('снимки в браузере', () => {
  it('страница на 390 и 1240; страницы нет — снимка нет', async () => {
    const pages = [
      { name: 'test', path: '/index.html' },
      { name: 'missing', path: '/missing.html' },
    ];
    const shots = await takeShots(server.url, { pages });
    expect(shots.map((shot) => `${shot.page}-${shot.width}`)).toEqual(['test-390', 'test-1240']);
    const widths = shots.map((shot) => PNG.sync.read(shot.png).width);
    expect(widths[0]).toBeGreaterThanOrEqual(390);
    expect(widths[1]).toBeGreaterThanOrEqual(1240);
  });
});
