import { describe, expect, it } from 'vitest';
import type { Delivery, Handler } from '../src/broker';
import {
  DEFAULT_SLOTS,
  DEFAULT_TIMEOUT_MS,
  failureOf,
  nestReply,
  parseDesignJob,
  readDesignSettings,
  runDesignJob,
  startDesigns,
  type JobDeps,
} from '../src/design/design-job';
import { DESIGN_PATTERN, DESIGNS_QUEUE } from '../src/design/design-queue';
import { finishStyle } from '../src/design/design-style';
import { DesignError, designFailure, type DesignReply, type DesignSnapshot } from '../src/design/design-types';
import { DEFAULT_OUTLINE, DEFAULT_STYLE, outlineChain, pick, styleChain } from '../src/design/registry';

// Задание «Дизайн по ссылке»: форма сообщения, срок, ответ в формате ClientProxy Nest.

const NOW = 1_800_000_000_000;
const data = (fields: Record<string, unknown> = {}) => ({
  v: 1,
  siteId: 'site-1',
  url: 'https://shop.example/',
  owned: false,
  deadline: NOW + 90_000,
  ...fields,
});
const envelope = (fields: Record<string, unknown> = {}) => ({ pattern: DESIGN_PATTERN, id: 'c-1', data: data(fields) });

const snapshot: DesignSnapshot = {
  v: 1,
  ok: true,
  tool: 'own',
  toolVersion: 'js-1',
  outlineTool: 'dom',
  ms: 1200,
  style: finishStyle({}, { url: 'https://shop.example/', finalUrl: 'https://shop.example/', title: 'Т' }),
  outline: { v: 1, blocks: [] },
  content: null,
  raw: {},
};

describe('форма задания', () => {
  it('строгая: лишнее поле, не http(s), длинный адрес, чужой pattern — отказ', () => {
    expect(parseDesignJob(envelope())).toEqual(data());
    expect(parseDesignJob(envelope({ extra: 1 }))).toBeNull();
    expect(parseDesignJob(envelope({ url: 'file:///etc/passwd' }))).toBeNull();
    expect(parseDesignJob(envelope({ url: `https://a.b/${'x'.repeat(2001)}` }))).toBeNull();
    expect(parseDesignJob(envelope({ owned: 'да' }))).toBeNull();
    expect(parseDesignJob({ pattern: 'storefront.look', data: data() })).toBeNull();
    expect(parseDesignJob('мусор')).toBeNull();
  });

  it('настройки: места и срок, по умолчанию 1 и 60 с', () => {
    expect(readDesignSettings({})).toEqual({ slots: DEFAULT_SLOTS, timeoutMs: DEFAULT_TIMEOUT_MS });
    expect(readDesignSettings({ DESIGN_SLOTS: '2', DESIGN_TIMEOUT_MS: '45000' })).toEqual({
      slots: 2,
      timeoutMs: 45_000,
    });
    expect(() => readDesignSettings({ DESIGN_SLOTS: '0' })).toThrow();
  });

  it('цепочки инструментов из окружения; неизвестный — ошибка запуска', () => {
    expect(styleChain({}).map((tool) => tool.name)).toEqual(DEFAULT_STYLE.split(','));
    expect(outlineChain({}).map((tool) => tool.name)).toEqual(DEFAULT_OUTLINE.split(','));
    expect(styleChain({ DESIGN_STYLE: 'own, own,designlang' }).map((tool) => tool.name)).toEqual(['own', 'designlang']);
    expect(() => styleChain({ DESIGN_STYLE: 'own,figma' })).toThrow('DESIGN_STYLE: нет инструментов figma');
    expect(() => pick('X', ' , ', 'a', { a: 1 })).toThrow('(пусто)');
  });
});

describe('выполнение задания', () => {
  const ran: unknown[] = [];
  const deps = (run: JobDeps['run']): JobDeps => ({ run, timeoutMs: 60_000, now: () => NOW });

  it('не по форме — invalid; срок почти вышел — timeout, снятие не начинается', async () => {
    const run: JobDeps['run'] = (input) => {
      ran.push(input);
      return Promise.resolve(snapshot);
    };
    expect(await runDesignJob(deps(run), { pattern: DESIGN_PATTERN, data: {} })).toEqual(
      designFailure('invalid', 'Задание дизайна не по форме'),
    );
    expect(await runDesignJob(deps(run), envelope({ deadline: NOW + 1_000 }))).toMatchObject({
      ok: false,
      error: { code: 'timeout' },
    });
    expect(ran).toEqual([]);
  });

  it('свой срок не дольше DESIGN_TIMEOUT_MS; успех — снимок', async () => {
    const inputs: unknown[] = [];
    const reply = await runDesignJob(
      deps((input) => {
        inputs.push(input);
        return Promise.resolve(snapshot);
      }),
      envelope({ owned: true }),
    );
    expect(reply).toBe(snapshot);
    expect(inputs).toEqual([{ url: 'https://shop.example/', owned: true, deadline: NOW + 60_000 }]);
  });

  it('отказ с кодом — тот же код; любая другая ошибка — tool-failed', async () => {
    expect(
      await runDesignJob(
        deps(() => Promise.reject(new DesignError('bot-protection', 'Сайт не пустил\nстек'))),
        envelope(),
      ),
    ).toEqual(designFailure('bot-protection', 'Сайт не пустил'));
    expect(failureOf('строка')).toEqual(designFailure('tool-failed', 'Снять дизайн не получилось: строка'));
  });
});

describe('очередь storefront_designs', () => {
  it('ответ на replyTo в формате Nest, по DESIGN_SLOTS разом; журнал без адреса целиком', async () => {
    const replies: Array<{ to: string; id: string | undefined; body: unknown }> = [];
    const logs: Array<[string, Record<string, unknown> | undefined]> = [];
    let handler: Handler | undefined;
    let consumed: [string, number] | undefined;
    const broker = {
      consume: (queue: string, prefetch: number, next: Handler) => {
        consumed = [queue, prefetch];
        handler = next;
        return Promise.resolve();
      },
      reply: (to: string, id: string | undefined, body: unknown) => {
        replies.push({ to, id, body });
        return Promise.resolve();
      },
    };
    const results: DesignReply[] = [snapshot, designFailure('blocked', 'нельзя')];
    await startDesigns(broker, {
      run: () => Promise.resolve(results.shift() ?? snapshot),
      timeoutMs: 60_000,
      now: () => NOW,
      slots: 2,
      log: (event, fields) => logs.push([event, fields]),
    });
    expect(consumed).toEqual([DESIGNS_QUEUE, 2]);
    const delivery = (fields: Partial<Delivery>): Delivery => ({
      exchange: '',
      body: envelope(),
      replyTo: 'amq.rabbitmq.reply-to',
      correlationId: 'c-1',
      ...fields,
    });
    await handler?.(delivery({}));
    await handler?.(delivery({ correlationId: undefined }));
    await handler?.(delivery({ replyTo: undefined }));
    expect(replies[0]).toEqual({
      to: 'amq.rabbitmq.reply-to',
      id: 'c-1',
      body: { err: null, response: snapshot, isDisposed: true, id: 'c-1' },
    });
    expect(replies[1]?.body).toEqual(nestReply(designFailure('blocked', 'нельзя'), undefined));
    expect(replies).toHaveLength(2);
    expect(logs[0]).toEqual([
      'design-done',
      {
        shopId: 'site-1',
        host: 'shop.example',
        ms: 0,
        tool: 'own',
        outlineTool: 'dom',
        bands: 1,
        blocks: 0,
        owned: false,
      },
    ]);
    expect(logs[1]).toEqual([
      'design-failed',
      { shopId: 'site-1', host: 'shop.example', ms: 0, code: 'blocked', error: 'нельзя' },
    ]);
  });
});
