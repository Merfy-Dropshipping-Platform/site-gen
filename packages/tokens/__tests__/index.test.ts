import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('API пакета (design.md, раздел 9)', () => {
  it('отдаёт ровно эти имена', () => {
    expect(Object.keys(api).sort()).toEqual([
      'TokenError',
      'checkEdits',
      'choiceAttributes',
      'contrastIssues',
      'createTokensTool',
      'dependentsOf',
      'dictionaryJsonSchema',
      'emitCss',
      'extendDictionary',
      'groupsOf',
      'limitsOf',
      'mergeEdits',
      'parseDictionary',
      'parseTheme',
      'parseTokenEdits',
      'platformDictionary',
      'resolveTokens',
      'runTokensTool',
      'searchCatalog',
      'searchTokens',
      'sourceOf',
      'tailwindCss',
      'themeTokensJsonSchema',
      'tokensCss',
      'tokensMarkdown',
      'tokensTool',
    ]);
  });
});
