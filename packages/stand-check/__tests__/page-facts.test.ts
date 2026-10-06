import { describe, expect, it } from 'vitest';
import { relativeToOrigin, scriptEntries, type ScriptFact } from '../src/browser/page-facts';

const ORIGIN = 'http://localhost:4321';
const fact = (overrides: Partial<ScriptFact>): ScriptFact => ({ src: '', type: '', id: '', bytes: 10, ...overrides });

describe('relativeToOrigin', () => {
  it('свой адрес — путь с параметрами, без хоста и порта', () => {
    expect(relativeToOrigin('http://localhost:4321/_astro/a.js?x=1', ORIGIN)).toBe('/_astro/a.js?x=1');
  });

  it('чужой адрес — целиком', () => {
    expect(relativeToOrigin('https://widget.example/chat.js', ORIGIN)).toBe('https://widget.example/chat.js');
  });
});

describe('scriptEntries', () => {
  it('вид скрипта — по type: модуль, JSON, обычный внешний и встроенный', () => {
    const entries = scriptEntries(
      [
        fact({ src: `${ORIGIN}/a.js`, type: 'module' }),
        fact({ id: 'merfy-config', type: 'application/json' }),
        fact({ src: 'https://widget.example/chat.js' }),
        fact({}),
      ],
      ORIGIN,
    );
    expect(entries).toEqual([
      { src: '/a.js', kind: 'module', bytes: 10 },
      { src: '#merfy-config', kind: 'json', bytes: 10 },
      { src: 'https://widget.example/chat.js', kind: 'external', bytes: 10 },
      { src: 'inline:1', kind: 'inline', bytes: 10 },
    ]);
  });

  it('встроенные без id нумеруются по порядку, скрипты с id не в счёт', () => {
    const entries = scriptEntries([fact({}), fact({ id: 'x' }), fact({ type: 'module' })], ORIGIN);
    expect(entries.map((entry) => entry.src)).toEqual(['inline:1', '#x', 'inline:2']);
  });
});
