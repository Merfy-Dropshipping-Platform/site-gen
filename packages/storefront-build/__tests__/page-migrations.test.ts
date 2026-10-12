import { tokensCss, type TokenMigrations } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import type { ShopPageLocals } from '../src/locals';
import { renderShopPage, type RenderPage } from '../src/page';
import { changedInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

const RENAME: TokenMigrations = {
  v: 1,
  steps: [{ id: 'button-corner-rename', version: '0.2.0', kind: 'rename', from: 'button-corner', to: 'radius-button' }],
};

// Подставной рисовальщик: запоминает данные страницы и отдаёт HTML общего подставного рисовальщика — по договору SEO
// с тегами og: и twitter:card (блок 9), как nova.
function capturing(seen: ShopPageLocals[]): RenderPage {
  return (path, locals) => {
    seen.push(locals);
    return fakeRender(path, locals);
  };
}

const oldName = changedInputs((inputs) => (inputs.revision.tokens = { root: { 'button-corner': 12 } }));

describe('правки мерчанта переводятся при рисовании (design.md блока 10)', () => {
  it('правка к старому имени рисуется под новым', async () => {
    const seen: ShopPageLocals[] = [];
    await renderShopPage(oldName, '/', { tokens: novaTokens, render: capturing(seen), migrations: RENAME });
    const expected = tokensCss(novaTokens.dictionary, novaTokens.tokens, { root: { 'radius-button': 12 } });
    expect(seen[0].head.tokensCss).toBe(expected);
  });

  it('без шагов перевода правка к старому имени — ошибка входов', async () => {
    const theme = { tokens: novaTokens, render: capturing([]) };
    await expect(renderShopPage(oldName, '/', theme)).rejects.toMatchObject({
      code: 'inputs-invalid',
      path: 'revision.tokens',
    });
  });
});
