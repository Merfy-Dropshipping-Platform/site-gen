import {
  buildPreviewCartDemoScript,
  injectPreviewCartDemoScript,
} from '../preview-cart-contract';

// F-053 / F-058: preview-only demo cart seed. When
// localStorage.getItem('<theme>:cart:v1') is falsy (null | ''), it fetches
// storefront-data, stores one real product and dispatches '<theme>:cart:updated'.
// Any truthy existing value (incl. literal '[]' or a non-empty invalid string)
// prevents seeding; the same truthiness check after fetch prevents a race
// overwrite. The script is injected at the FIRST real <head> opening on both
// v2-sections and built-theme paths — never at an embedded/closing </body>.

const SITE = 'site-xyz';
const THEME = 'bloom';

describe('buildPreviewCartDemoScript', () => {
  const script = buildPreviewCartDemoScript(SITE, THEME);

  it('keys localStorage on <theme>:cart:v1', () => {
    expect(script).toContain('"bloom:cart:v1"');
  });

  it('guards on falsy localStorage BEFORE fetch (missing key / empty string)', () => {
    // First guard: return early if a value already exists.
    const firstGuard = script.indexOf("if(window.localStorage.getItem(K))return;");
    expect(firstGuard).toBeGreaterThan(-1);
    // The guard sits before the fetch call.
    expect(firstGuard).toBeLessThan(script.indexOf('fetch('));
  });

  it('re-checks the SAME truthiness after fetch (race guard)', () => {
    // Two identical guards: one pre-fetch, one post-fetch (inside .then).
    const occurrences = script.split('if(window.localStorage.getItem(K))return;').length - 1;
    expect(occurrences).toBe(2);
  });

  it('fetches storefront-data for the site and dispatches <theme>:cart:updated', () => {
    expect(script).toContain(
      "fetch('/api/sites/'+\"site-xyz\"+'/storefront-data')",
    );
    expect(script).toContain('"bloom:cart:updated"');
  });

  it('sets exactly one demo line (preview-demo id, quantity 1)', () => {
    expect(script).toContain("id:'preview-demo'");
    expect(script).toContain('quantity:1');
    expect(script).toContain('window.localStorage.setItem(K,JSON.stringify([line]))');
  });

  it('is wrapped in a try/catch IIFE and never contains a </body> literal', () => {
    expect(script.startsWith('<script>(function(){try{')).toBe(true);
    // Structural fact: the demo script must not carry a </body> that a naive
    // </body>-based injector could later match.
    expect(script).not.toContain('</body>');
  });
});

describe('injectPreviewCartDemoScript (head placement, both paths)', () => {
  const v2NavAgentHtml =
    '<!doctype html><html><head><title>x</title></head>' +
    // nav-agent JS carrying an EMBEDDED </body> literal inside a string.
    '<body><script>var s="<body>hi</body>";</script><p>v2</p></body></html>';

  const builtThemeHtml =
    '<!doctype html><html><head data-x="1"><meta charset="utf-8"></head>' +
    '<body><h1>built</h1></body></html>';

  it('inserts immediately after the FIRST real <head> opening (v2 nav-agent fixture)', () => {
    const out = injectPreviewCartDemoScript(v2NavAgentHtml, SITE, THEME);
    const headOpen = out.indexOf('<head>') + '<head>'.length;
    const scriptAt = out.indexOf('<script>(function(){try{');
    expect(scriptAt).toBe(headOpen);
  });

  it('inserts after a <head ...> with attributes (built-theme fixture)', () => {
    const out = injectPreviewCartDemoScript(builtThemeHtml, SITE, THEME);
    const headTag = '<head data-x="1">';
    const headOpen = out.indexOf(headTag) + headTag.length;
    const scriptAt = out.indexOf('<script>(function(){try{');
    expect(scriptAt).toBe(headOpen);
  });

  it('does NOT insert at any </body> — embedded nav-agent </body> stays untouched', () => {
    const out = injectPreviewCartDemoScript(v2NavAgentHtml, SITE, THEME);
    // The demo script sits in <head>, strictly before the embedded </body>.
    const scriptAt = out.indexOf('<script>(function(){try{');
    const embeddedBody = out.indexOf('"<body>hi</body>"');
    expect(scriptAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeLessThan(embeddedBody);
    // The embedded nav-agent string is preserved verbatim.
    expect(out).toContain('var s="<body>hi</body>";');
  });

  it('injects exactly once', () => {
    const out = injectPreviewCartDemoScript(builtThemeHtml, SITE, THEME);
    const count = out.split('<script>(function(){try{').length - 1;
    expect(count).toBe(1);
  });
});
