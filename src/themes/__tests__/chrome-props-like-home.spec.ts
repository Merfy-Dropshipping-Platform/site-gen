import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Пункт 3а сближения «витрина = конструктор». Замер 23.09 на пяти стендах: на
// внутренних страницах витрины flux/bloom/rose заголовок рассылки в подвале на
// шаг крупнее, чем на главной и в конструкторе. Причина: хром (шапку и подвал
// главной на остальных страницах) рисовали СЫРЫМИ пропсами ревизии, мимо
// `coerceFooterProps`, через который проходит тот же подвал на самой главной.

// Рендер секций подменён: здесь проверяется, КАКИЕ пропсы уходят в рендер.
jest.mock('../../services/preview.service', () => {
  const renderBlock = jest.fn(async ({ blockName }: { blockName: string }) => `<i>${blockName}</i>`);
  const hasV2Sections = jest.fn(async () => true);
  const resolveBlockScheme = jest.fn(async () => null);
  return {
    PreviewService: jest
      .fn()
      .mockImplementation(() => ({ renderBlock, hasV2Sections, resolveBlockScheme })),
  };
});

import { applyChromeToDist } from '../v2-live-pages';
import { assembleChrome } from '../chrome-assembler';
import {
  extractPageBlocks,
  pagePropsPreparer,
  prepareBlockProps,
  themeBlocksFor,
} from '../page-blocks';
import type { BuildContext } from '../../generator/build.service';

type Props = Record<string, unknown>;
type RenderInput = { blockName: string; props: Props };

const SITE = 'site-3a';
const PUBLIC_URL = 'https://shop.example';
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

// Подвал главной без heading/text — ровно так он лежит у стендов flux/bloom/rose.
const revision = () => ({
  pagesData: {
    home: {
      content: [
        { type: 'Header', props: { id: 'Header-1', siteTitle: 'Магазин', logo: '/uploads/logo.png' } },
        { type: 'Hero', props: { id: 'Hero-1' } },
        {
          type: 'Footer',
          props: {
            id: 'Footer-1',
            colorScheme: 'scheme-3',
            newsletter: { enabled: 'true', heading: 'Подпишитесь' },
          },
        },
      ],
    },
  },
});

const rawHomeProps = (type: string): Props =>
  revision().pagesData.home.content.find((b) => b.type === type)!.props;

async function homePagePropsOf(type: string, theme: string): Promise<Props> {
  const blocks = await extractPageBlocks(revision(), 'home', PUBLIC_URL, theme, SITE);
  return blocks!.find((b) => b.type === type)!.props;
}

async function chromeRenderInputs(
  theme: string,
  prepareProps?: ReturnType<typeof pagePropsPreparer>,
): Promise<RenderInput[]> {
  const seen: RenderInput[] = [];
  const renderBlock = async (input: RenderInput) => {
    seen.push(input);
    return `<i>${input.blockName}</i>`;
  };
  await assembleChrome({
    pagesData: revision().pagesData,
    theme,
    chrome: 'full',
    renderBlock,
    isPreview: false,
    prepareProps,
  });
  return seen;
}

const propsFor = (inputs: RenderInput[], blockName: string): Props =>
  inputs.find((i) => i.blockName === blockName)!.props;

describe.each(THEMES)('хром = главная, тема %s', (theme) => {
  const prepare = () => pagePropsPreparer({ publicUrl: PUBLIC_URL, siteId: SITE, themeId: theme });

  it.each(['Header', 'Footer'])('%s: хром получает те же пропсы, что тот же блок на главной', async (type) => {
    const inputs = await chromeRenderInputs(theme, prepare());
    expect(propsFor(inputs, type)).toEqual(await homePagePropsOf(type, theme));
  });

  it('без подготовки (выключатель выкл.) — сырые пропсы ревизии, как раньше', async () => {
    const inputs = await chromeRenderInputs(theme);
    expect(propsFor(inputs, 'Footer')).toEqual(rawHomeProps('Footer'));
    expect(propsFor(inputs, 'Header')).toEqual(rawHomeProps('Header'));
  });
});

it('подвал без размера заголовка и текста получает «малый» — как на главной', () => {
  const prepared = prepareBlockProps('Footer', rawHomeProps('Footer'), {
    publicUrl: null,
    siteId: SITE,
    themeBlocks: themeBlocksFor('bloom'),
  });
  expect(prepared.heading).toMatchObject({ size: 'small' });
  expect(prepared.text).toMatchObject({ size: 'small' });
});

describe('витрина: выключатель PARITY_CHROME в applyChromeToDist', () => {
  const savedEnv = process.env.PARITY_CHROME;
  let distDir: string;

  const mockedRenderBlock = (): jest.Mock => {
    const { PreviewService } = jest.requireMock<{
      PreviewService: new () => { renderBlock: jest.Mock };
    }>('../../services/preview.service');
    return new PreviewService().renderBlock;
  };

  const renderedFooterProps = async (): Promise<Props> => {
    const renderBlock = mockedRenderBlock();
    renderBlock.mockClear();
    const ctx = { siteId: SITE, publicUrl: PUBLIC_URL, distDir, revisionData: revision() };
    await applyChromeToDist(ctx as unknown as BuildContext, 'bloom');
    const call = renderBlock.mock.calls.map(([input]) => input as RenderInput).find((i) => i.blockName === 'Footer');
    return call!.props;
  };

  beforeEach(async () => {
    distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-3a-'));
    const page = '<html><body><header data-nt="bloom-header">old</header><main></main><footer>old</footer></body></html>';
    await fs.writeFile(path.join(distDir, 'index.html'), page);
    await fs.mkdir(path.join(distDir, 'catalog'));
    await fs.writeFile(path.join(distDir, 'catalog', 'index.html'), page);
  });

  afterEach(async () => {
    if (savedEnv === undefined) delete process.env.PARITY_CHROME;
    else process.env.PARITY_CHROME = savedEnv;
    await fs.rm(distDir, { recursive: true, force: true });
  });

  it('включён для сайта → подвал внутренних страниц рисуется с пропсами главной', async () => {
    process.env.PARITY_CHROME = SITE;
    expect(await renderedFooterProps()).toEqual(await homePagePropsOf('Footer', 'bloom'));
  });

  it('выключен → сырые пропсы ревизии, поведение до правки', async () => {
    process.env.PARITY_CHROME = 'off';
    expect(await renderedFooterProps()).toEqual(rawHomeProps('Footer'));
  });

  it('включён для ДРУГОГО сайта → этот сайт не меняется', async () => {
    process.env.PARITY_CHROME = 'another-site';
    expect(await renderedFooterProps()).toEqual(rawHomeProps('Footer'));
  });
});
