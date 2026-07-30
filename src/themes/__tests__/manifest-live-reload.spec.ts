/**
 * Манифесты тем приходят через `resolveJsonModule` — на рантайме это КОПИЯ в
 * `dist/packages/theme-<id>/theme.json`, сделанная при сборке. В разработке
 * правка исходного `theme.json` молча не применялась до `nest build`: ошибки
 * нет, просто действуют старые значения. Час на это уходил впустую.
 *
 * Вне production загрузчик обязан читать исходник и подхватывать правки.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getThemeManifest } from '../theme-manifest-loader';

const FLUX = path.resolve(process.cwd(), 'packages', 'theme-flux', 'theme.json');

describe('getThemeManifest — исходник против собранной копии', () => {
  const original = fs.readFileSync(FLUX, 'utf-8');
  const prevEnv = process.env.NODE_ENV;

  afterEach(() => {
    fs.writeFileSync(FLUX, original);
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  });

  it('вне production подхватывает правку исходника без пересборки', () => {
    process.env.NODE_ENV = 'development';

    const before = getThemeManifest('flux');
    expect(before?.defaults?.['--radius-button']).toBe('4px');

    const edited = JSON.parse(original);
    edited.defaults['--radius-button'] = '99px';
    // mtime должен отличаться от закэшированного — пишем и трогаем время явно
    fs.writeFileSync(FLUX, JSON.stringify(edited, null, 2));
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(FLUX, future, future);

    const after = getThemeManifest('flux');
    expect(after?.defaults?.['--radius-button']).toBe('99px');
  });

  it('в production исходник не читается — только собранная копия', () => {
    process.env.NODE_ENV = 'production';

    const edited = JSON.parse(original);
    edited.defaults['--radius-button'] = '77px';
    fs.writeFileSync(FLUX, JSON.stringify(edited, null, 2));
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(FLUX, future, future);

    expect(getThemeManifest('flux')?.defaults?.['--radius-button']).not.toBe('77px');
  });

  it('неизвестная тема — null, без падения', () => {
    process.env.NODE_ENV = 'development';
    expect(getThemeManifest('нет-такой-темы')).toBeNull();
  });

  it('defaultScheme объявлен по id и существует среди схем', () => {
    process.env.NODE_ENV = 'development';
    const m = getThemeManifest('flux');
    expect(m?.defaultScheme).toBe('scheme-2');
    expect(m?.colorSchemes?.map((s) => s.id)).toContain(m?.defaultScheme);
  });
});
