// Парсинг и переписывание `<Блок>.classes.ts` через TS AST.
//
// Структура файла:
//   export const HeaderClasses = {
//     wrapper: 'w-full ...',
//     sticky: { 'scroll-up': '...', always: '...' },
//     mobileMenu: { root: '...', nav: '...' },
//   } as const;
//
// Для каталога — извлекаем строки. Для миграции — переписываем литералы
// с заменой захардкоженных значений на var(--токен).

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * Извлечь все классы из `<Блок>.classes.ts`.
 * @param {string} sourceText — содержимое файла
 * @param {string} exportName — имя экспорта, например `HeaderClasses`
 * @returns {Record<string, string | Record<string, string>>}
 */
export function extractClassesObject(sourceText, exportName) {
  const sf = ts.createSourceFile(`${exportName}.ts`, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let objectExpr = null;

  function visit(node) {
    if (objectExpr) return;
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === exportName && d.initializer) {
          let init = d.initializer;
          // `... as const` — снять
          while (ts.isAsExpression(init)) init = init.expression;
          if (ts.isObjectLiteralExpression(init)) objectExpr = init;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);

  if (!objectExpr) {
    throw new Error(`Не нашёл объект ${exportName} в файле.`);
  }

  return readObjectLiteral(objectExpr);
}

function readObjectLiteral(expr) {
  const out = {};
  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = readPropName(prop.name);
    if (!name) continue;
    const value = readPropValue(prop.initializer);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

function readPropName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node)) return node.text;
  return null;
}

function readPropValue(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isObjectLiteralExpression(node)) return readObjectLiteral(node);
  return undefined;
}

/**
 * Сплющить вложенный объект classes в плоский Map путей.
 *   { mobileMenu: { root: 'X', nav: 'Y' }, wrapper: 'Z' }
 * →
 *   { 'mobileMenu.root': 'X', 'mobileMenu.nav': 'Y', wrapper: 'Z' }
 */
export function flattenClasses(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out[key] = v;
    } else if (v && typeof v === 'object') {
      Object.assign(out, flattenClasses(v, key));
    }
  }
  return out;
}

/**
 * Переписать `<Блок>.classes.ts` — заменить захардкоженные значения на
 * `var(--токен)` по правилам replacements.
 *
 * replacements: [{ elementKey, oldClass, newClass }]
 *   - elementKey: 'wrapper' или 'mobileMenu.root'
 *   - oldClass: исходное значение (string)
 *   - newClass: новое значение (string)
 *
 * Возвращает новый текст файла.
 */
export function rewriteClassesFile(sourceText, exportName, replacements) {
  const sf = ts.createSourceFile(`${exportName}.ts`, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Собираем replacements в Map: путь → { old, new }
  const repMap = new Map();
  for (const r of replacements) {
    repMap.set(r.elementKey, r);
  }

  // Найти объект и пройти по нему рекурсивно, собирая правки строковых литералов
  const edits = []; // [{ pos, end, newText }]

  let objectExpr = null;

  function findObject(node) {
    if (objectExpr) return;
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === exportName && d.initializer) {
          let init = d.initializer;
          while (ts.isAsExpression(init)) init = init.expression;
          if (ts.isObjectLiteralExpression(init)) objectExpr = init;
        }
      }
    }
    ts.forEachChild(node, findObject);
  }
  findObject(sf);

  if (!objectExpr) {
    throw new Error(`Не нашёл объект ${exportName} в файле.`);
  }

  function visit(expr, prefix) {
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = readPropName(prop.name);
      if (!name) continue;
      const path = prefix ? `${prefix}.${name}` : name;

      if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
        const r = repMap.get(path);
        if (r) {
          // Проверяем что текущее значение совпадает с ожидаемым
          if (prop.initializer.text === r.oldClass) {
            // Заменить на новую строку с сохранением кавычек
            const quote = sourceText[prop.initializer.getStart(sf)];
            const newLit = `${quote}${escapeStringForQuote(r.newClass, quote)}${quote}`;
            edits.push({
              pos: prop.initializer.getStart(sf),
              end: prop.initializer.getEnd(),
              newText: newLit,
            });
          }
        }
      } else if (ts.isObjectLiteralExpression(prop.initializer)) {
        visit(prop.initializer, path);
      }
    }
  }
  visit(objectExpr, '');

  // Применить правки в обратном порядке
  edits.sort((a, b) => b.pos - a.pos);
  let result = sourceText;
  for (const e of edits) {
    result = result.slice(0, e.pos) + e.newText + result.slice(e.end);
  }
  return { text: result, editsCount: edits.length };
}

function escapeStringForQuote(s, quote) {
  if (quote === "'") return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (quote === '"') return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return s;
}
