import { describe, expect, it } from 'vitest';
import { counterScripts } from '../src/core/analytics/counters';

// Шаблоны счётчиков — одна копия для ядра и сборки (блок 13 «Секций и SDK», часть 13б): сборка считает хеши встроенного
// кода по counterScripts, ядро вставляет те же скрипты.
describe('counterScripts', () => {
  it('Метрика — встроенный код с номером', () => {
    const scripts = counterScripts({ kind: 'metrika', number: '12345678' });
    expect(scripts.map((script) => script.src)).toEqual([null]);
    expect(scripts[0]?.code).toContain('ym(12345678,"init"');
  });

  it('Google — файл gtag и встроенный код с номером', () => {
    const scripts = counterScripts({ kind: 'google', number: 'G-ABCDEF12' });
    expect(scripts.map((script) => script.src)).toEqual([
      'https://www.googletagmanager.com/gtag/js?id=G-ABCDEF12',
      null,
    ]);
    expect(scripts[1]?.code).toContain("gtag('config','G-ABCDEF12')");
  });

  it('VK — встроенный загрузчик с номером', () => {
    expect(counterScripts({ kind: 'vk', number: 'VK-RTRG-1-a' })[0]?.code).toContain(
      'VK.Retargeting.Init("VK-RTRG-1-a")',
    );
  });

  it('номер не по правилу вида — скриптов нет', () => {
    expect(counterScripts({ kind: 'metrika', number: '12a' })).toEqual([]);
  });
});
