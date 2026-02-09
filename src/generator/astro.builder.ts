import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import archiver from "archiver";

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
  await fs.writeFile(filePath, content, "utf8");
}

function pkgJson() {
  return JSON.stringify(
    {
      name: "merfy-site-astro-template",
      private: true,
      type: "module",
      version: "0.0.0",
      scripts: {
        build: "astro build",
      },
      dependencies: {
        astro: "^4.0.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "@astrojs/react": "^3.0.0",
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
  build: { outDir: '${outDir.replace(/\\/g, "/")}'}
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
import data from '../data/data.json';

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
const shopId = data?.meta?.shopId ?? '';
const apiUrl = data?.meta?.apiUrl ?? 'https://gateway.merfy.ru/api';

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
            <button
              class="buy-button"
              data-product-id={product.id}
              data-product-name={product.name}
              data-product-price={product.price}
            >
              Купить
            </button>
          </div>
        </article>
      ))}
    </div>
  )}
</section>

<!-- Модальное окно для ввода email -->
<div id="checkout-modal" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-content">
    <h3>Оформление заказа</h3>
    <p id="modal-product-name"></p>
    <p id="modal-product-price" style="font-weight:bold;font-size:1.25rem;color:#222;margin-bottom:16px"></p>
    <form id="checkout-form">
      <input type="email" id="customer-email" placeholder="Ваш email" required />
      <input type="tel" id="customer-phone" placeholder="Телефон (необязательно)" />
      <div class="modal-buttons">
        <button type="button" class="cancel-btn" id="modal-cancel">Отмена</button>
        <button type="submit" class="submit-btn" id="modal-submit">Оплатить</button>
      </div>
    </form>
    <div id="checkout-loading" class="hidden">
      <div class="spinner"></div>
      <p>Создаём заказ...</p>
    </div>
    <div id="checkout-error" class="hidden"></div>
  </div>
</div>

<script define:vars={{ shopId, apiUrl }}>
  // Quick Checkout Flow
  const modal = document.getElementById('checkout-modal');
  const form = document.getElementById('checkout-form');
  const loading = document.getElementById('checkout-loading');
  const errorDiv = document.getElementById('checkout-error');
  let currentProduct = null;

  // Открыть модалку при клике на "Купить"
  document.querySelectorAll('.buy-button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentProduct = {
        id: btn.dataset.productId,
        name: btn.dataset.productName,
        price: Number(btn.dataset.productPrice)
      };
      document.getElementById('modal-product-name').textContent = currentProduct.name;
      document.getElementById('modal-product-price').textContent =
        new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 })
          .format(currentProduct.price);
      modal.classList.remove('hidden');
      form.classList.remove('hidden');
      loading.classList.add('hidden');
      errorDiv.classList.add('hidden');
    });
  });

  // Закрыть модалку
  document.getElementById('modal-cancel').addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  document.querySelector('.modal-backdrop').addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Отправка формы - Quick Checkout
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('customer-email').value;
    const phone = document.getElementById('customer-phone').value;

    form.classList.add('hidden');
    loading.classList.remove('hidden');
    errorDiv.classList.add('hidden');

    try {
      // 1. Создать корзину
      const cartRes = await fetch(apiUrl + '/orders/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId: shopId })
      });
      const cartData = await cartRes.json();
      if (!cartData.success) throw new Error(cartData.message || 'Не удалось создать корзину');
      const cartId = cartData.data.id;

      // 2. Добавить товар
      const addRes = await fetch(apiUrl + '/orders/cart/' + cartId + '/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: currentProduct.id, quantity: 1 })
      });
      const addData = await addRes.json();
      if (!addData.success) throw new Error(addData.message || 'Не удалось добавить товар');

      // 3. Установить данные покупателя
      const customerRes = await fetch(apiUrl + '/orders/cart/' + cartId + '/customer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, phone: phone || undefined })
      });
      const customerData = await customerRes.json();
      if (!customerData.success) throw new Error(customerData.message || 'Не удалось сохранить данные');

      // 4. Checkout
      const checkoutRes = await fetch(apiUrl + '/orders/cart/' + cartId + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutData.success) throw new Error(checkoutData.message || 'Ошибка оформления заказа');
      const orderId = checkoutData.data.id;

      // 5. Создать платёж и редиректнуть на ЮKassa
      const returnUrl = window.location.origin + '/checkout-result/?orderId=' + orderId;
      const paymentRes = await fetch(apiUrl + '/orders/' + orderId + '/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: returnUrl })
      });
      const paymentData = await paymentRes.json();
      if (!paymentData.success) throw new Error(paymentData.message || 'Не удалось создать платёж');

      // Редирект на страницу оплаты ЮKassa
      window.location.href = paymentData.data.confirmationUrl;

    } catch (err) {
      loading.classList.add('hidden');
      form.classList.remove('hidden');
      errorDiv.classList.remove('hidden');
      errorDiv.textContent = err.message || 'Произошла ошибка';
    }
  });
</script>

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

  .buy-button {
    display: inline-block;
    background: #22c55e;
    color: #fff;
    padding: 12px 24px;
    border-radius: 6px;
    border: none;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    width: 100%;
  }

  .buy-button:hover {
    background: #16a34a;
  }

  /* Modal styles */
  .modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal.hidden {
    display: none;
  }

  .modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
  }

  .modal-content {
    position: relative;
    background: #fff;
    padding: 24px;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }

  .modal-content h3 {
    margin: 0 0 16px;
    font-size: 1.25rem;
  }

  .modal-content p {
    margin: 0 0 8px;
    color: #666;
  }

  .modal-content input {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  .modal-content input:focus {
    outline: none;
    border-color: #22c55e;
  }

  .modal-buttons {
    display: flex;
    gap: 12px;
    margin-top: 16px;
  }

  .cancel-btn {
    flex: 1;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    font-size: 1rem;
  }

  .cancel-btn:hover {
    background: #f5f5f5;
  }

  .submit-btn {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 6px;
    background: #22c55e;
    color: #fff;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
  }

  .submit-btn:hover {
    background: #16a34a;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #22c55e;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 20px auto;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  #checkout-loading {
    text-align: center;
    padding: 20px;
  }

  #checkout-error {
    color: #dc2626;
    padding: 12px;
    background: #fef2f2;
    border-radius: 6px;
    margin-top: 12px;
  }
</style>
`;
}

function checkoutResultAstro() {
  return `---
import data from '../data/data.json';
const apiUrl = data?.meta?.apiUrl ?? 'https://gateway.merfy.ru/api';
---

<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Результат оплаты</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 80px auto; padding: 40px 20px; text-align: center; }
      .icon { width: 80px; height: 80px; margin: 0 auto 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
      .icon.success { background: #dcfce7; color: #22c55e; }
      .icon.pending { background: #fef3c7; color: #f59e0b; }
      .icon.failed { background: #fee2e2; color: #dc2626; }
      .icon svg { width: 40px; height: 40px; }
      h1 { font-size: 1.5rem; margin-bottom: 12px; }
      p { color: #666; margin-bottom: 24px; }
      .btn { display: inline-block; background: #222; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; }
      .btn:hover { background: #444; }
      .spinner { width: 60px; height: 60px; border: 4px solid #f3f3f3; border-top: 4px solid #22c55e; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 24px; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .hidden { display: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <div id="loading">
        <div class="spinner"></div>
        <h1>Проверяем оплату...</h1>
        <p>Пожалуйста, подождите</p>
      </div>

      <div id="success" class="hidden">
        <div class="icon success">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h1>Оплата прошла успешно!</h1>
        <p>Спасибо за заказ. Мы свяжемся с вами для подтверждения.</p>
        <a href="/" class="btn">Вернуться на главную</a>
      </div>

      <div id="pending" class="hidden">
        <div class="icon pending">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <h1>Оплата обрабатывается</h1>
        <p>Ваш платёж находится в обработке. Вы получите уведомление на email.</p>
        <a href="/" class="btn">Вернуться на главную</a>
      </div>

      <div id="failed" class="hidden">
        <div class="icon failed">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </div>
        <h1>Оплата не прошла</h1>
        <p>К сожалению, оплата не была завершена. Попробуйте ещё раз.</p>
        <a href="/" class="btn">Вернуться на главную</a>
      </div>
    </div>

    <script define:vars={{ apiUrl }}>
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get('orderId');

      const loadingDiv = document.getElementById('loading');
      const successDiv = document.getElementById('success');
      const pendingDiv = document.getElementById('pending');
      const failedDiv = document.getElementById('failed');

      function showStatus(status) {
        loadingDiv.classList.add('hidden');
        successDiv.classList.add('hidden');
        pendingDiv.classList.add('hidden');
        failedDiv.classList.add('hidden');

        if (status === 'succeeded') successDiv.classList.remove('hidden');
        else if (status === 'pending' || status === 'processing') pendingDiv.classList.remove('hidden');
        else failedDiv.classList.remove('hidden');
      }

      if (!orderId) {
        showStatus('failed');
      } else {
        let attempts = 0;
        const maxAttempts = 15;

        async function checkStatus() {
          try {
            const res = await fetch(apiUrl + '/orders/' + orderId + '/payment-status');
            const data = await res.json();

            if (data.success && data.data) {
              const status = data.data.status;
              if (status === 'succeeded') {
                showStatus('succeeded');
                return;
              }
              if (status === 'failed' || status === 'cancelled') {
                showStatus('failed');
                return;
              }
            }

            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(checkStatus, 2000);
            } else {
              showStatus('pending');
            }
          } catch (e) {
            showStatus('failed');
          }
        }

        checkStatus();
      }
    </script>
  </body>
</html>
`;
}

async function zipDir(srcDir: string, outZipPath: string) {
  await fs.mkdir(path.dirname(outZipPath), { recursive: true });
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = (await fs.open(outZipPath, "w")).createWriteStream();
  return new Promise<void>((resolve, reject) => {
    archive.directory(srcDir, false).on("error", reject).pipe(stream);
    stream.on("close", () => resolve());
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
  const themeName = theme || "default";
  const templateRoot = path.join(
    process.cwd(),
    "templates",
    "astro",
    themeName,
  );
  const exists = await fs
    .stat(templateRoot)
    .then((st) => st.isDirectory())
    .catch(() => false);
  if (!exists) return false;
  await copyDir(templateRoot, workingDir);
  return true;
}

export async function buildWithAstro(
  params: AstroBuildParams,
): Promise<{ ok: boolean; artifactPath?: string; error?: string }> {
  const { workingDir, outDir, data, products = [] } = params;
  try {
    // 1) Подготовить проект Astro: если есть тема templates/astro/<theme>, скопировать её; иначе fallback на базовый шаблон
    const templateUsed = await ensureTemplate(workingDir, params.theme);

    // Базовые файлы — пишем только если их нет (чтобы не затирать шаблон)
    const pkgPath = path.join(workingDir, "package.json");
    const astroCfgPath = path.join(workingDir, "astro.config.mjs");
    if (!(await fs.stat(pkgPath).catch(() => false))) {
      await writeFile(pkgPath, pkgJson());
    }
    if (!(await fs.stat(astroCfgPath).catch(() => false))) {
      await writeFile(astroCfgPath, astroConfig(path.join(workingDir, "dist")));
    }
    if (!templateUsed) {
      await writeFile(
        path.join(workingDir, "src/pages/index.astro"),
        indexAstro(),
      );
      await writeFile(
        path.join(workingDir, "src/components/Hero.astro"),
        heroAstro(),
      );
      await writeFile(
        path.join(workingDir, "src/components/TextBlock.astro"),
        textBlockAstro(),
      );
      await writeFile(
        path.join(workingDir, "src/components/ButtonRow.astro"),
        buttonRowAstro(),
      );
      await writeFile(
        path.join(workingDir, "src/components/ProductGrid.astro"),
        productGridAstro(),
      );
      await writeFile(
        path.join(workingDir, "src/pages/checkout-result.astro"),
        checkoutResultAstro(),
      );
    } else {
      // Если шаблон есть, но нет ProductGrid — добавляем его
      const productGridPath = path.join(
        workingDir,
        "src/components/ProductGrid.astro",
      );
      const hasProductGrid = await fs
        .stat(productGridPath)
        .then(() => true)
        .catch(() => false);
      if (!hasProductGrid) {
        await writeFile(productGridPath, productGridAstro());
      }
    }

    // Всегда добавляем страницу результата оплаты
    await writeFile(
      path.join(workingDir, "src/pages/checkout-result.astro"),
      checkoutResultAstro(),
    );

    // Записываем данные страницы с shopId и apiUrl для checkout
    const pageData = {
      ...(data ?? {}),
      meta: {
        ...(data?.meta ?? {}),
        shopId: params.tenantId ?? "", // tenantId here receives siteId from generator.service
        apiUrl:
          params.apiUrl ??
          process.env.API_GATEWAY_URL ??
          "https://gateway.merfy.ru/api",
      },
    };
    await writeFile(
      path.join(workingDir, "src/data/data.json"),
      JSON.stringify(pageData, null, 2),
    );
    await writeFile(
      path.join(workingDir, "src/data/products.json"),
      JSON.stringify(products, null, 2),
    );

    // 2) Установить зависимости и собрать
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        "npm",
        ["install", "--silent", "--no-fund", "--no-audit"],
        { cwd: workingDir, stdio: "ignore" },
      );
      p.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("npm install failed")),
      );
      p.on("error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      const p = spawn("npm", ["run", "build", "--silent"], {
        cwd: workingDir,
        stdio: "ignore",
      });
      p.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("astro build failed")),
      );
      p.on("error", reject);
    });

    // 3) Упаковать dist в zip
    const artifactZip = path.join(outDir, params.outFileName ?? "site.zip");
    await zipDir(path.join(workingDir, "dist"), artifactZip);

    return { ok: true, artifactPath: artifactZip };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
