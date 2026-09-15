import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import {
  PG_CONNECTION,
  BILLING_RMQ_SERVICE,
  PRODUCT_RMQ_SERVICE,
} from '../constants';
import { extractPageBlocks, applyCollectionContextToProps } from '../themes/page-blocks';
import { migrateRevisionData } from '../utils/revision-migrations';
import {
  injectPreviewCollectionGlobal,
  PREVIEW_COLLECTION_GLOBAL,
  PREVIEW_COLLECTION_MARKER,
} from '../common/preview-collection-inline';

/**
 * Баг владельца (15.09): в секции «Группа товаров» вместо названия коллекции
 * стоит сырой `{{COLLECTION_NAME}}`.
 *
 * Страница коллекции — ШАБЛОН: в Puck JSON лежит не текст, а плейсхолдеры
 * {{COLLECTION_NAME}} / {{COLLECTION_DESCRIPTION}} / {{COLLECTION_IMAGE}}.
 * Подставляет их тот, кто рисует, а рисуют ТРИ разных пути:
 *   1. живая витрина — substituteVars в сгенерённом collections/[slug].astro;
 *   2. целая страница превью и live-пересадка секций — extractPageBlocks;
 *   3. ТОЧЕЧНЫЙ hot-render одной секции — POST /api/sites/:id/preview/block
 *      (им идут и update-block при правке любого поля панели, и reconcile).
 *
 * Подстановки не было ровно у третьего. Замер на проде 15.09 (24 клетки
 * путь×тема×состояние): пути 1 и 2 — 0 сырых плейсхолдеров во всех 16 клетках;
 * путь 3 — сырой текст в 4 клетках (flux, vanilla) и тихая потеря имени ещё в
 * 4 (bloom/satin печатали «Каталог» вместо «Общая»).
 *
 * Гард держит три вещи:
 *  1. ни один путь не выпускает {{COLLECTION_*}} в props;
 *  2. пути 2 и 3 дают ОДИН И ТОТ ЖЕ текст — они рисуют одну секцию на одном экране;
 *  3. проводка цела: агент превью шлёт контекст в оба fetch к /preview/block,
 *     GET-превью кладёт глобал в <head>.
 *
 * Путь 3 здесь — РЕАЛЬНЫЙ HTTP-эндпоинт (харнесс как в
 * preview-block-hidden-items.spec.ts), а не вызов чистой функции: иначе гард
 * сторожил бы свою фикстуру и пережил бы вырезанную проводку контроллера.
 */

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;
const RAW = /\{\{COLLECTION_[A-Z]+\}\}/g;
const REPO = path.resolve(__dirname, '../..');
/** Плейсхолдеры живут только в этих двух блоках сидов коллекции. */
const PLACEHOLDER_BLOCKS = new Set(['Catalog', 'Hero']);

type Block = { type: string; props: Record<string, unknown> };
type Ctx = { name?: string; description?: string; image?: string };

/** Сид темы — то, что видит свежесозданный магазин. */
function themeSeed(theme: string): Block[] {
  const file = path.join(REPO, 'packages', `theme-${theme}`, 'pages', 'collection.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { content: Block[] };
  return json.content.filter((b) => PLACEHOLDER_BLOCKS.has(b.type));
}

/** Легаси-сид — то, что досевает миграция ревизии старым сайтам ЛЮБОЙ темы. */
function legacySeed(): Block[] {
  const out = migrateRevisionData({ pagesData: {}, pages: [] } as never) as {
    pagesData: Record<string, { content: Block[] }>;
  };
  return out.pagesData['page-collection'].content.filter((b) =>
    PLACEHOLDER_BLOCKS.has(b.type),
  );
}

const SOURCES: Array<{ name: string; blocks: (theme: string) => Block[] }> = [
  { name: 'сид темы', blocks: (t) => themeSeed(t) },
  { name: 'легаси-сид миграции', blocks: () => legacySeed() },
];

const STATES: Array<{ name: string; ctx: Ctx }> = [
  {
    name: 'коллекция выбрана',
    ctx: { name: 'Общая', description: 'Подборка', image: '/c.jpg' },
  },
  { name: 'коллекция не выбрана', ctx: {} },
];

function rawCount(v: unknown): number {
  return (JSON.stringify(v ?? null).match(RAW) ?? []).length;
}

/** Текст поля, которое может лежать и строкой, и конвертом {text}/{content}. */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as { text?: unknown; content?: unknown };
    if (typeof o.text === 'string') return o.text;
    if (typeof o.content === 'string') return o.content;
  }
  return '';
}

/** Смысловые поля, куда подставляется коллекция. Форма конверта не важна. */
function facets(b: Block): Record<string, string> {
  const p = b.props;
  if (b.type === 'Catalog') {
    return {
      type: b.type,
      title: textOf(p.categoryTitle) || textOf(p.heading),
      subtitle: textOf(p.categorySubtitle),
    };
  }
  return {
    type: b.type,
    title: textOf(p.heading),
    subtitle: textOf(p.subtitle),
    image: typeof p.backgroundImage === 'string' ? p.backgroundImage : '',
  };
}

describe('{{COLLECTION_*}} — название коллекции во всех путях рендера', () => {
  let app: INestApplication;
  let renderBlock: jest.Mock;
  let dbCall = 0;

  const site = {
    currentRevisionId: 'rev-1',
    publicUrl: null,
    themeId: 'rose',
    tenantId: 'tenant-1',
  };

  beforeAll(async () => {
    renderBlock = jest.fn().mockResolvedValue('<section data-puck-component-id="x"></section>');
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            dbCall += 1;
            return dbCall === 1 ? [site] : [{ data: { content: [] } }];
          },
        }),
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PreviewController],
      providers: [
        {
          provide: PreviewService,
          useValue: {
            renderBlock,
            hasV2Sections: jest.fn().mockResolvedValue(false),
            resolveBlockScheme: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: PG_CONNECTION, useValue: db },
        { provide: BILLING_RMQ_SERVICE, useValue: { send: jest.fn(), emit: jest.fn() } },
        { provide: PRODUCT_RMQ_SERVICE, useValue: { send: jest.fn(), emit: jest.fn() } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Путь 2 — целая страница превью конструктора + live-пересадка секций. */
  async function viaPage(blocks: Block[], ctx: Ctx): Promise<Block[]> {
    const data = {
      pagesData: { 'page-collection': { content: blocks } },
    } as Record<string, unknown>;
    const out = await extractPageBlocks(
      data, 'page-collection', null, null, 'site-1', undefined, undefined, ctx,
    );
    expect(out).not.toBeNull();
    return out as Block[];
  }

  /** Путь 3 — ТОЧЕЧНЫЙ hot-render: реальный POST /api/sites/:id/preview/block. */
  async function viaHotRender(blocks: Block[], ctx: Ctx): Promise<Block[]> {
    const out: Block[] = [];
    for (const b of blocks) {
      renderBlock.mockClear();
      dbCall = 0;
      const res = await request(app.getHttpServer())
        .post('/api/sites/site-1/preview/block')
        .send({
          blockType: b.type,
          themeId: 'rose',
          props: b.props,
          collectionContext: ctx,
        });
      expect(res.status).toBe(200);
      expect(renderBlock).toHaveBeenCalledTimes(1);
      out.push({
        type: b.type,
        props: (renderBlock.mock.calls[0][0] as { props: Record<string, unknown> }).props,
      });
    }
    return out;
  }

  for (const theme of THEMES) {
    for (const src of SOURCES) {
      for (const st of STATES) {
        const label = `${theme} / ${src.name} / ${st.name}`;

        it(`${label} — целая страница превью: 0 сырых плейсхолдеров`, async () => {
          const out = await viaPage(src.blocks(theme), st.ctx);
          expect(rawCount(out.map((b) => b.props))).toBe(0);
        });

        it(`${label} — точечный hot-render: 0 сырых плейсхолдеров`, async () => {
          const out = await viaHotRender(src.blocks(theme), st.ctx);
          expect(rawCount(out.map((b) => b.props))).toBe(0);
        });

        it(`${label} — оба пути дают один и тот же текст`, async () => {
          const a = await viaPage(src.blocks(theme), st.ctx);
          const b = await viaHotRender(src.blocks(theme), st.ctx);
          expect(b.map(facets)).toEqual(a.map(facets));
        });
      }
    }
  }

  it('без контекста коллекции (обычная страница) hot-render не трогает props', async () => {
    renderBlock.mockClear();
    dbCall = 0;
    await request(app.getHttpServer())
      .post('/api/sites/site-1/preview/block')
      .send({ blockType: 'Catalog', themeId: 'rose', props: { categoryTitle: '' } });
    const props = (renderBlock.mock.calls[0][0] as { props: Record<string, unknown> }).props;
    // Заголовок НЕ заполняется «Каталогом»: вне страницы коллекции это делает
    // сам блок, и навязывать ему текст отсюда нельзя.
    expect(props.categoryTitle).toBe('');
  });
});

describe('{{COLLECTION_*}} — семантика подстановки', () => {
  it('коллекция выбрана → подставляется её имя/описание/картинка', () => {
    const props = applyCollectionContextToProps(
      'Hero',
      {
        heading: { text: '{{COLLECTION_NAME}}' },
        subtitle: { content: '{{COLLECTION_DESCRIPTION}}' },
        backgroundImage: '{{COLLECTION_IMAGE}}',
      },
      { name: 'Зима 2026', description: 'Тёплая одежда', image: '/w.jpg' },
    );
    expect(textOf(props.heading)).toBe('Зима 2026');
    expect(textOf(props.subtitle)).toBe('Тёплая одежда');
    expect(props.backgroundImage).toBe('/w.jpg');
  });

  it('коллекции нет → имя падает в «Каталог», описание/картинка пустеют (как на live)', () => {
    const props = applyCollectionContextToProps(
      'Hero',
      {
        heading: { text: '{{COLLECTION_NAME}}' },
        subtitle: { content: '{{COLLECTION_DESCRIPTION}}' },
        backgroundImage: '{{COLLECTION_IMAGE}}',
      },
      {},
    );
    expect(textOf(props.heading)).toBe('Каталог');
    expect(textOf(props.subtitle)).toBe('');
    expect(props.backgroundImage).toBe('');
  });

  it('пустой заголовок Catalog заполняется именем коллекции (иначе хардкод «Каталог»)', () => {
    const props = applyCollectionContextToProps(
      'Catalog', { cards: 8 }, { name: 'Новинки', description: 'Свежее' },
    );
    expect(props.categoryTitle).toBe('Новинки');
    expect(props.categorySubtitle).toBe('Свежее');
  });

  it('свой заголовок мерчанта не перетирается именем коллекции', () => {
    const props = applyCollectionContextToProps(
      'Catalog', { categoryTitle: 'Мой текст' }, { name: 'Новинки' },
    );
    expect(props.categoryTitle).toBe('Мой текст');
  });

  it('плейсхолдер подставляется и внутри массивов (arrayFields)', () => {
    const props = applyCollectionContextToProps(
      'Hero', { items: [{ label: '{{COLLECTION_NAME}}' }] }, { name: 'Новинки' },
    );
    expect((props.items as Array<{ label: string }>)[0].label).toBe('Новинки');
  });
});

describe('{{COLLECTION_*}} — глобал превью', () => {
  const HTML = '<html><head><title>x</title></head><body><h1>x</h1></body></html>';

  it('контекст есть → глобал попадает в <head>', () => {
    const out = injectPreviewCollectionGlobal(HTML, { name: 'Общая' });
    expect(out).toContain(PREVIEW_COLLECTION_MARKER);
    expect(out).toContain('"Общая"');
    expect(out.indexOf(PREVIEW_COLLECTION_MARKER)).toBeLessThan(out.indexOf('<body'));
  });

  it('пустой контекст (коллекция не выбрана) — глобал всё равно ставится', () => {
    // Агент отличает «страница не коллекционная» (глобала нет) от «коллекционная
    // без данных» (глобал = {}) именно наличием глобала.
    expect(injectPreviewCollectionGlobal(HTML, {})).toContain(PREVIEW_COLLECTION_MARKER);
  });

  it('контекста нет (обычная страница) → HTML не трогаем', () => {
    expect(injectPreviewCollectionGlobal(HTML, undefined)).toBe(HTML);
  });

  it('документ без <head> не трогаем вовсе (страницы-шеллы блоб-пути)', () => {
    // Первая редакция клала тег ПЕРЕД <!DOCTYPE> и ломала шеллы без головы —
    // поймано preview-page-routing.spec.ts. Соседние инжекторы превью ведут себя
    // так же: нет <head> — нет вставки.
    const bare = '<!DOCTYPE html><html>COLLECTION</html>';
    expect(injectPreviewCollectionGlobal(bare, {})).toBe(bare);
  });

  it('повторный инжект не дублирует глобал', () => {
    const once = injectPreviewCollectionGlobal(HTML, { name: 'Общая' });
    const twice = injectPreviewCollectionGlobal(once, { name: 'Общая' });
    expect(twice).toBe(once);
    expect(twice.split(PREVIEW_COLLECTION_MARKER).length - 1).toBe(1);
  });
});

describe('{{COLLECTION_*}} — проводка путей рендера', () => {
  const agent = fs.readFileSync(path.join(REPO, 'src/services/preview.service.ts'), 'utf8');
  const controller = fs.readFileSync(
    path.join(REPO, 'src/controllers/preview.controller.ts'), 'utf8',
  );

  it('агент превью шлёт контекст коллекции в ОБА fetch к /preview/block', () => {
    const calls = agent.split("'/preview/block'").length - 1;
    expect(calls).toBe(2);
    const withCtx = agent.split(/collectionContext:\s*collectionCtx\(\)/).length - 1;
    expect(withCtx).toBe(calls);
  });

  it('агент читает именно глобал превью', () => {
    expect(agent).toContain(`window.${PREVIEW_COLLECTION_GLOBAL}`);
  });

  // Сторожим ВЫЗОВ, а не имя: строка импорта содержит то же слово, и проверка
  // `toContain('injectPreviewCollectionGlobal')` оставалась зелёной даже после
  // того, как вызов из injectPreviewGlobals был вырезан (поймано саботажем).
  it('GET-превью реально ЗОВЁТ инжектор глобала (не просто импортирует)', () => {
    const calls =
      controller.split(/injectPreviewCollectionGlobal\s*\(/).length - 1;
    expect(calls).toBe(1);
  });

  it('инжектор вызывается внутри injectPreviewGlobals с поднятым контекстом', () => {
    const body = controller.slice(controller.indexOf('private injectPreviewGlobals('));
    expect(body.slice(0, 4000)).toContain(
      'injectPreviewCollectionGlobal(html, collectionContext)',
    );
  });

  it('контекст коллекции доезжает до ОБОИХ путей отдачи превью (v2 и блоб)', () => {
    // Оба вызова injectPreviewGlobals обязаны передавать collectionContext —
    // иначе на одном из путей агент остаётся без глобала и hot-render там снова
    // рисует сырой плейсхолдер.
    const injects = controller.split(/this\.injectPreviewGlobals\(/).length - 1;
    expect(injects).toBe(2);
    // Последний аргумент вызова — сразу после productSection. Считаем именно
    // эту пару, а не голое слово: `collectionContext,` встречается ещё и в
    // аргументах extractPageBlocks (первая редакция гарда на этом и ошиблась).
    const passed =
      controller.split(
        /this\.productSectionFromRevision\(loaded\.data\),\s*\n\s*collectionContext,/g,
      ).length - 1;
    expect(passed).toBe(injects);
  });
});
