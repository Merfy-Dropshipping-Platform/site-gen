import { describe, expect, it } from 'vitest';
import samplesJson from '../scenarios/samples-present.json';
import { checklistOf } from '../src/scenario/checklist';
import { parseScenario } from '../src/scenario/schema';

const samples = parseScenario(samplesJson);

describe('checklistOf', () => {
  it('строка на сценарий: итог автомата, что смотреть глазами, пустая колонка «ОК»', () => {
    const html = checklistOf([{ scenario: samples, target: 'local', ok: true }]);
    expect(html).toContain('<th>Локально</th>');
    expect(html).not.toContain('<th>Dev</th>');
    expect(html).toContain('<td class="pass">прошёл</td>');
    expect(html).toContain('схемы читаются<br>кнопки видны во всех схемах');
    expect(html).toContain('<td class="ok-cell"></td>');
  });

  it('сценарий × где прогоняли: где не прогоняли — прочерк', () => {
    const other = { ...samples, id: 'other', title: 'Другой' };
    const html = checklistOf([
      { scenario: samples, target: 'local', ok: false },
      { scenario: other, target: 'dev', ok: true },
    ]);
    expect(html).toContain('<th>Локально</th><th>Dev</th>');
    expect(html).toContain('<td class="fail">не прошёл</td><td class="missing">—</td>');
    expect(html).toContain('<td class="missing">—</td><td class="pass">прошёл</td>');
  });

  it('текст сценария экранируется', () => {
    const html = checklistOf([{ scenario: { ...samples, title: '<b>жирный</b>' }, target: 'local', ok: true }]);
    expect(html).toContain('&lt;b&gt;жирный&lt;/b&gt;');
  });

  it('прогонов нет — так и пишет', () => {
    expect(checklistOf([])).toBe('<p>Сценарии не прогонялись.</p>');
  });
});
