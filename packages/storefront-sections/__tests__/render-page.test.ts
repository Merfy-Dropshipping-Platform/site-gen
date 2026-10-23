import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate } from '../src/compile';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { templateProblems } from '../src/template';

// page в Astro.props каждой секции (блок 7 «Секций и SDK», часть 7а): id и адрес страницы, на которой стоит секция; у
// страницы 404 адреса нет — null. "uses" не нужен; в запросе нет page — главная.
const NAV = `---
const { settings, page } = Astro.props;
---
<nav>{settings.items.split(',').map((url) => <a href={url} aria-current={url === page.path ? 'page' : undefined}>{url}</a>)}<span>{page.id}|{String(page.path)}</span></nav>`;
const OPTIONS = { richtext: { section: new Set<string>(), block: new Set<string>() }, blocks: false };

const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

async function navRequest() {
  const checked = await checkTemplate(NAV, OPTIONS);
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  return {
    section: 'shop:nav',
    hash: sha256(Buffer.from(checked.render, 'utf8')),
    module: checked.render,
    settings: { items: '/,/o-nas' },
  };
}

function rendererOf(): SectionRenderer {
  const renderer = startSectionRenderer();
  opened.push(renderer);
  return renderer;
}

describe('page в шаблоне и в процессе рендера', () => {
  it('frontmatter и выражения принимают page без "uses"', async () => {
    expect(await templateProblems(NAV)).toEqual([]);
  });

  it('своя страница — её id и адрес; текущий пункт — aria-current', async () => {
    const page = { id: 'page-custom-1', path: '/o-nas' };
    const html = await rendererOf().render({ ...(await navRequest()), page });
    expect(html).toContain('<a href="/o-nas" aria-current="page">/o-nas</a>');
    expect(html).toContain('<span>page-custom-1|/o-nas</span>');
  });

  it('страница 404 — адреса нет; запрос без page — главная', async () => {
    const renderer = rendererOf();
    const request = await navRequest();
    const notFound = await renderer.render({ ...request, page: { id: 'not-found', path: null } });
    expect(notFound).toContain('<span>not-found|null</span>');
    const home = await renderer.render(request);
    expect(home).toContain('<a href="/" aria-current="page">/</a>');
    expect(home).toContain('<span>home|/</span>');
  });
});
