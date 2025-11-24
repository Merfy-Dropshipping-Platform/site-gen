import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import archiver from 'archiver';
async function writeFile(filePath, content) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}
function pkgJson() {
    return JSON.stringify({
        name: 'merfy-site-astro-template',
        private: true,
        type: 'module',
        version: '0.0.0',
        scripts: {
            build: 'astro build',
        },
        dependencies: {
            astro: '^4.0.0',
            react: '^18.3.1',
            'react-dom': '^18.3.1',
            '@astrojs/react': '^3.0.0',
        },
    }, null, 2);
}
function astroConfig(outDir) {
    return `import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  output: 'static',
  build: { outDir: '${outDir.replace(/\\/g, '/')}'}
});
`;
}
function indexAstro() {
    return `---
import data from '../data/data.json';
import Hero from '../components/Hero.astro';
import TextBlock from '../components/TextBlock.astro';
import ButtonRow from '../components/ButtonRow.astro';
const blocks = data?.content ?? [];
---
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{data?.meta?.title ?? 'Мой сайт на Merfy'}</title>
  </head>
  <body>
    {blocks.map((b) => {
      switch (b.type) {
        case 'Hero':
          return <Hero {...b.props} />;
        case 'TextBlock':
          return <TextBlock {...b.props} />;
        case 'ButtonRow':
          return <ButtonRow {...b.props} />;
        default:
          return <div>Неизвестный блок: {b.type}</div>;
      }
    })}
  </body>
</html>
`;
}
function heroAstro() {
    return `---
const { eyebrow, title, description, align = 'left' } = Astro.props;
---
<section style={{ textAlign: align }}>
  {eyebrow && <p style="text-transform: uppercase; opacity:.7">{eyebrow}</p>}
  <h1>{title ?? 'Заголовок'}</h1>
  {description && <p>{description}</p>}
</section>
`;
}
function textBlockAstro() {
    return `---
const { content } = Astro.props;
---
<div><p>{content ?? 'Текстовый блок'}</p></div>
`;
}
function buttonRowAstro() {
    return `---
const { label, href = '#', variant = 'primary' } = Astro.props;
const style = variant === 'secondary' ? 'background:#ddd;color:#222' : 'background:#222;color:#fff';
---
<div>
  <a href={href} style={style}>
    {label ?? 'Подробнее'}
  </a>
  </div>
`;
}
async function zipDir(srcDir, outZipPath) {
    await fs.mkdir(path.dirname(outZipPath), { recursive: true });
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = (await fs.open(outZipPath, 'w')).createWriteStream();
    return new Promise((resolve, reject) => {
        archive.directory(srcDir, false).on('error', reject).pipe(stream);
        stream.on('close', () => resolve());
        archive.finalize().catch(reject);
    });
}
export async function buildWithAstro(params) {
    const { workingDir, outDir, data } = params;
    try {
        await writeFile(path.join(workingDir, 'package.json'), pkgJson());
        await writeFile(path.join(workingDir, 'astro.config.mjs'), astroConfig(path.join(workingDir, 'dist')));
        await writeFile(path.join(workingDir, 'src/pages/index.astro'), indexAstro());
        await writeFile(path.join(workingDir, 'src/components/Hero.astro'), heroAstro());
        await writeFile(path.join(workingDir, 'src/components/TextBlock.astro'), textBlockAstro());
        await writeFile(path.join(workingDir, 'src/components/ButtonRow.astro'), buttonRowAstro());
        await writeFile(path.join(workingDir, 'src/data/data.json'), JSON.stringify(data ?? {}, null, 2));
        await new Promise((resolve, reject) => {
            const p = spawn('npm', ['install', '--silent', '--no-fund', '--no-audit'], { cwd: workingDir, stdio: 'ignore' });
            p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('npm install failed'))));
            p.on('error', reject);
        });
        await new Promise((resolve, reject) => {
            const p = spawn('npm', ['run', 'build', '--silent'], { cwd: workingDir, stdio: 'ignore' });
            p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('astro build failed'))));
            p.on('error', reject);
        });
        const artifactZip = path.join(outDir, params.outFileName ?? 'site.zip');
        await zipDir(path.join(workingDir, 'dist'), artifactZip);
        return { ok: true, artifactPath: artifactZip };
    }
    catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}
//# sourceMappingURL=astro.builder.js.map