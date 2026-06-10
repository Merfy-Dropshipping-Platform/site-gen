import * as fs from 'fs/promises';
import * as path from 'path';

const STYLE_ID = '__merfy_tokens_css';
const EXISTING_RE = new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?<\\/style>`);

export function tokensStyleTag(css: string): string {
  return `<style id="${STYLE_ID}">${css}</style>`;
}

/** Вставляет/обновляет style#__merfy_tokens_css перед </head>. Идемпотентен. */
export function injectTokensCssIntoHtml(html: string, css: string): string {
  const tag = tokensStyleTag(css);
  if (EXISTING_RE.test(html)) return html.replace(EXISTING_RE, tag);
  const i = html.search(/<\/head>/i);
  if (i === -1) return html;
  return html.slice(0, i) + tag + html.slice(i);
}

/** Прогон по всем *.html диста (live publish v2). Возвращает число файлов. */
export async function injectTokensCssIntoDist(distDir: string, css: string): Promise<number> {
  let count = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.html')) {
        const html = await fs.readFile(p, 'utf8');
        const out = injectTokensCssIntoHtml(html, css);
        if (out !== html) {
          await fs.writeFile(p, out, 'utf8');
          count++;
        }
      }
    }
  }
  await walk(distDir);
  return count;
}
