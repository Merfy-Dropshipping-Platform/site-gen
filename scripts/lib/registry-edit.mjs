// Добавление новых токенов в `registry.ts` и `base-defaults.ts` через TS AST.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * Добавить новые токены в registry.ts перед закрывающей `}`.
 *   tokens: [{ name: '--header-nav-max-width-2xl', category: 'size', unit: 'px', scope: 'theme' }]
 * Возвращает новый текст файла, и список НОВЫХ токенов (без дубликатов).
 */
export function addTokensToRegistry(sourceText, tokens) {
  const sf = ts.createSourceFile('registry.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Найти объект TOKEN_REGISTRY
  let objExpr = null;
  function find(node) {
    if (objExpr) return;
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === 'TOKEN_REGISTRY' && d.initializer) {
          let init = d.initializer;
          while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) {
            init = init.expression;
          }
          if (ts.isObjectLiteralExpression(init)) objExpr = init;
        }
      }
    }
    ts.forEachChild(node, find);
  }
  find(sf);

  if (!objExpr) {
    throw new Error('Не нашёл TOKEN_REGISTRY в registry.ts');
  }

  // Существующие ключи
  const existing = new Set();
  for (const prop of objExpr.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const n = prop.name;
    if (ts.isStringLiteral(n)) existing.add(n.text);
    else if (ts.isIdentifier(n)) existing.add(n.text);
  }

  const newTokens = tokens.filter((t) => !existing.has(t.name));
  if (newTokens.length === 0) return { text: sourceText, addedCount: 0, addedTokens: [] };

  // Вставить перед закрывающей `}` (objExpr.end - 1)
  const insertPos = objExpr.getEnd() - 1; // позиция `}` exclusive
  const lines = newTokens.map((t) => {
    const parts = [`category: '${t.category}'`];
    if (t.unit) parts.push(`unit: '${t.unit}'`);
    parts.push(`scope: '${t.scope || 'theme'}'`);
    if (typeof t.min === 'number') parts.push(`min: ${t.min}`);
    if (typeof t.max === 'number') parts.push(`max: ${t.max}`);
    return `  '${t.name}': { ${parts.join(', ')} },`;
  });
  const block = `  // ── v2 миграция — токены блока (добавлено скриптом)\n${lines.join('\n')}\n`;
  const result = sourceText.slice(0, insertPos) + block + sourceText.slice(insertPos);

  return { text: result, addedCount: newTokens.length, addedTokens: newTokens };
}

/**
 * Добавить значения в base-defaults.ts перед закрывающей `}`.
 *   defaults: [{ name: '--header-nav-max-width-2xl', value: '1320px' }]
 */
export function addDefaultsToBaseDefaults(sourceText, defaults) {
  const sf = ts.createSourceFile('base-defaults.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let objExpr = null;
  function find(node) {
    if (objExpr) return;
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === 'BASE_DEFAULTS' && d.initializer) {
          let init = d.initializer;
          while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) {
            init = init.expression;
          }
          if (ts.isObjectLiteralExpression(init)) objExpr = init;
        }
      }
    }
    ts.forEachChild(node, find);
  }
  find(sf);

  if (!objExpr) {
    throw new Error('Не нашёл BASE_DEFAULTS в base-defaults.ts');
  }

  const existing = new Set();
  for (const prop of objExpr.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const n = prop.name;
    if (ts.isStringLiteral(n)) existing.add(n.text);
    else if (ts.isIdentifier(n)) existing.add(n.text);
  }

  const newDefs = defaults.filter((d) => !existing.has(d.name));
  if (newDefs.length === 0) return { text: sourceText, addedCount: 0, addedDefaults: [] };

  const insertPos = objExpr.getEnd() - 1;
  const lines = newDefs.map((d) => `  '${d.name}': '${escapeSingleQuotes(d.value)}',`);
  const block = `  // ── v2 миграция — запасные значения (добавлено скриптом)\n${lines.join('\n')}\n`;
  const result = sourceText.slice(0, insertPos) + block + sourceText.slice(insertPos);

  return { text: result, addedCount: newDefs.length, addedDefaults: newDefs };
}

function escapeSingleQuotes(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Добавить значения токенов в theme.json `defaults`.
 *   themeJsonText: содержимое theme.json
 *   tokens: [{ name: '--header-nav-max-width-2xl', value: '1920px' }]
 * Возвращает новый текст с правильным форматированием.
 */
export function addTokensToThemeJson(themeJsonText, tokens) {
  const obj = JSON.parse(themeJsonText);
  if (!obj.defaults || typeof obj.defaults !== 'object') {
    obj.defaults = {};
  }
  let added = 0;
  for (const t of tokens) {
    if (!(t.name in obj.defaults)) added++;
    obj.defaults[t.name] = t.value;
  }
  return { text: JSON.stringify(obj, null, 2) + '\n', addedCount: added };
}
