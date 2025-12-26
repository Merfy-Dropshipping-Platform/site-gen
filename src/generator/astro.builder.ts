import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import archiver from 'archiver';

export interface ProductData {
  id: string;
  name: string;
  description?: string;
  price: number;
  images?: string[];
  slug?: string;
}

export interface AstroBuildParams {
  workingDir: string; // временная папка под сборку
  outDir: string; // каталог dist (внутри workingDir)
  data: any; // JSON Puck/тема
  outFileName?: string; // имя zip-артефакта (по умолчанию site.zip)
  theme?: string; // название темы (папка в templates/astro/<theme>)
  products?: ProductData[]; // товары для сайта
  tenantId?: string; // shopId для checkout
  apiUrl?: string; // URL API Gateway
}

async function writeFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

function pkgJson() {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  );
}

function astroConfig(outDir: string) {
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
import products from '../data/products.json';
import Hero from '../components/Hero.astro';
import TextBlock from '../components/TextBlock.astro';
import ButtonRow from '../components/ButtonRow.astro';
import ProductGrid from '../components/ProductGrid.astro';
const blocks = data?.content ?? [];
const hasProducts = products && products.length > 0;
---
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{data?.meta?.title ?? 'Мой сайт на Merfy'}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      {blocks.map((b) => {
        switch (b.type) {
          case 'Hero':
            return <Hero {...b.props} />;
          case 'TextBlock':
            return <TextBlock {...b.props} />;
          case 'ButtonRow':
            return <ButtonRow {...b.props} />;
          case 'ProductGrid':
            return <ProductGrid products={products} {...b.props} />;
          default:
            return <div>Неизвестный блок: {b.type}</div>;
        }
      })}
      {hasProducts && !blocks.some(b => b.type === 'ProductGrid') && (
        <ProductGrid products={products} title="Наши товары" />
      )}
    </div>
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

function productGridAstro() {
  return `---
interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  images?: string[];
  slug?: string;
}

interface Props {
  products: Product[];
  title?: string;
  columns?: number;
}

const { products = [], title = 'Товары', columns = 3 } = Astro.props;

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(price);
}
---

<section class="product-grid-section">
  {title && <h2 class="product-grid-title">{title}</h2>}

  {products.length === 0 ? (
    <p class="no-products">Товары скоро появятся</p>
  ) : (
    <div class="product-grid" style={\`grid-template-columns: repeat(\${columns}, 1fr)\`}>
      {products.map((product) => (
        <article class="product-card">
          <div class="product-image-wrapper">
            {product.images && product.images[0] ? (
              <img
                src={product.images[0]}
                alt={product.name}
                class="product-image"
                loading="lazy"
              />
            ) : (
              <div class="product-image-placeholder">
                <span>Нет фото</span>
              </div>
            )}
          </div>
          <div class="product-info">
            <h3 class="product-name">{product.name}</h3>
            {product.description && (
              <p class="product-description">{product.description}</p>
            )}
            <div class="product-price">{formatPrice(product.price)}</div>
            <a href={\`/product/\${product.slug ?? product.id}\`} class="product-link">
              Подробнее
            </a>
          </div>
        </article>
      ))}
    </div>
  )}
</section>

<style>
  .product-grid-section {
    padding: 40px 0;
  }

  .product-grid-title {
    font-size: 2rem;
    margin-bottom: 30px;
    text-align: center;
  }

  .no-products {
    text-align: center;
    color: #666;
    padding: 40px;
  }

  .product-grid {
    display: grid;
    gap: 24px;
  }

  @media (max-width: 768px) {
    .product-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }

  @media (max-width: 480px) {
    .product-grid {
      grid-template-columns: 1fr !important;
    }
  }

  .product-card {
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }

  .product-image-wrapper {
    aspect-ratio: 1;
    overflow: hidden;
    background: #f5f5f5;
  }

  .product-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .product-image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 14px;
  }

  .product-info {
    padding: 16px;
  }

  .product-name {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 8px;
    line-height: 1.3;
  }

  .product-description {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .product-price {
    font-size: 1.25rem;
    font-weight: 700;
    color: #222;
    margin-bottom: 12px;
  }

  .product-link {
    display: inline-block;
    background: #222;
    color: #fff;
    padding: 10px 20px;
    border-radius: 6px;
    text-decoration: none;
    font-size: 0.9rem;
    transition: background 0.2s;
  }

  .product-link:hover {
    background: #444;
  }
</style>
`;
}

async function zipDir(srcDir: string, outZipPath: string) {
  await fs.mkdir(path.dirname(outZipPath), { recursive: true });
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = (await fs.open(outZipPath, 'w')).createWriteStream();
  return new Promise<void>((resolve, reject) => {
    archive.directory(srcDir, false).on('error', reject).pipe(stream);
    stream.on('close', () => resolve());
    archive.finalize().catch(reject);
  });
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function ensureTemplate(workingDir: string, theme?: string) {
  const themeName = theme || 'default';
  const templateRoot = path.join(process.cwd(), 'templates', 'astro', themeName);
  const exists = await fs
    .stat(templateRoot)
    .then((st) => st.isDirectory())
    .catch(() => false);
  if (!exists) return false;
  await copyDir(templateRoot, workingDir);
  return true;
}

export async function buildWithAstro(params: AstroBuildParams): Promise<{ ok: boolean; artifactPath?: string; error?: string }>{
  const { workingDir, outDir, data, products = [] } = params;
  try {
    // 1) Подготовить проект Astro: если есть тема templates/astro/<theme>, скопировать её; иначе fallback на базовый шаблон
    const templateUsed = await ensureTemplate(workingDir, params.theme);

    // Базовые файлы — пишем только если их нет (чтобы не затирать шаблон)
    const pkgPath = path.join(workingDir, 'package.json');
    const astroCfgPath = path.join(workingDir, 'astro.config.mjs');
    if (!(await fs.stat(pkgPath).catch(() => false))) {
      await writeFile(pkgPath, pkgJson());
    }
    if (!(await fs.stat(astroCfgPath).catch(() => false))) {
      await writeFile(astroCfgPath, astroConfig(path.join(workingDir, 'dist')));
    }
    if (!templateUsed) {
      await writeFile(path.join(workingDir, 'src/pages/index.astro'), indexAstro());
      await writeFile(path.join(workingDir, 'src/components/Hero.astro'), heroAstro());
      await writeFile(path.join(workingDir, 'src/components/TextBlock.astro'), textBlockAstro());
      await writeFile(path.join(workingDir, 'src/components/ButtonRow.astro'), buttonRowAstro());
      await writeFile(path.join(workingDir, 'src/components/ProductGrid.astro'), productGridAstro());
    } else {
      // Если шаблон есть, но нет ProductGrid — добавляем его
      const productGridPath = path.join(workingDir, 'src/components/ProductGrid.astro');
      const hasProductGrid = await fs.stat(productGridPath).then(() => true).catch(() => false);
      if (!hasProductGrid) {
        await writeFile(productGridPath, productGridAstro());
      }
    }
    // Записываем данные страницы с shopId и apiUrl для checkout
    const pageData = {
      ...(data ?? {}),
      meta: {
        ...(data?.meta ?? {}),
        shopId: params.tenantId ?? '',
        apiUrl: params.apiUrl ?? process.env.API_GATEWAY_URL ?? 'https://api.merfy.ru',
      },
    };
    await writeFile(path.join(workingDir, 'src/data/data.json'), JSON.stringify(pageData, null, 2));
    await writeFile(path.join(workingDir, 'src/data/products.json'), JSON.stringify(products, null, 2));

    // 2) Установить зависимости и собрать
    await new Promise<void>((resolve, reject) => {
      const p = spawn('npm', ['install', '--silent', '--no-fund', '--no-audit'], { cwd: workingDir, stdio: 'ignore' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('npm install failed'))));
      p.on('error', reject);
    });
    await new Promise<void>((resolve, reject) => {
      const p = spawn('npm', ['run', 'build', '--silent'], { cwd: workingDir, stdio: 'ignore' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('astro build failed'))));
      p.on('error', reject);
    });

    // 3) Упаковать dist в zip
    const artifactZip = path.join(outDir, params.outFileName ?? 'site.zip');
    await zipDir(path.join(workingDir, 'dist'), artifactZip);

    return { ok: true, artifactPath: artifactZip };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
