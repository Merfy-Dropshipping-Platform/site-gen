import { chromium } from 'playwright';
const EMAIL = 'merfy-yookassa-2027@mail.ru', SITE = 'f07e4816-3f6d-4c51-a28c-f7b248b0d6d5';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1512, height: 950 } });
await ctx.request.post('https://gateway.merfy.ru/api/auth/sign-in/email', { headers: { 'Content-Type': 'application/json' }, data: { email: EMAIL, password: EMAIL } });
const page = await ctx.newPage();
await page.goto(`https://customize.merfy.ru/?siteId=${SITE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(12000);
const dump = await page.evaluate(() => {
  const leaf = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent && e.textContent.trim());
  const pageNames = [...new Set(leaf.map((e) => e.textContent.trim()).filter((t) => /Главн|Коллекц|Каталог|Корзин|Оформл|Страниц|Товар|Контакт|О нас/.test(t) && t.length < 25))].slice(0, 15);
  // секционный аутлайн: ищем элементы с data-* секций / лейблами секций
  const sectionLabels = [...new Set(leaf.map((e) => e.textContent.trim()).filter((t) => /Hero|Геро|Товар|Коллекц|Галер|Публикац|Мультиряд|Изображ|Новостн|Письм|Шапк|Подвал|Промо|Слайд/.test(t) && t.length < 30))].slice(0, 20);
  return {
    hasSkryt: leaf.filter((e) => e.textContent.trim() === 'Скрыть').length,
    pageNames, sectionLabels,
    // кнопки/иконки рядом с секциями (для поиска «...» и «глаз»)
    iconButtons: [...document.querySelectorAll('button, [role="button"]')].map((btn) => ({
      al: (btn.getAttribute('aria-label') || btn.title || '').trim().slice(0, 24),
      t: (btn.textContent || '').trim().slice(0, 16),
    })).filter((x) => x.al || x.t).slice(0, 40),
  };
});
console.log(JSON.stringify(dump, null, 2));
await b.close();
