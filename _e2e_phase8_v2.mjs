import { chromium } from 'playwright';

const SITE = 'https://dde2b0280a90.merfy.ru';
const OUT = '/tmp/e2e-rose/customer';
const log = (m) => console.log(`[phase8v2] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const consoleLogs = [];
const requests = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || t === 'log') consoleLogs.push(`${t}: ${m.text().substring(0, 250)}`);
});
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/api/') || u.includes('/storefront/') || u.includes('/cart')) {
    requests.push(`${req.method()} ${u.substring(0, 200)}`);
  }
});

const result = {};

try {
  // Step 1: Open product page
  log('open product page');
  await page.goto(`${SITE}/product/sumka-spring-10`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  // Click Add to Cart
  log('click Добавить в корзину');
  const addBtn = page.locator('button:has-text("Добавить в корзину")').first();
  await addBtn.click();
  await page.waitForTimeout(3000);

  // Capture localStorage
  const cart1 = await page.evaluate(() => {
    return JSON.stringify({
      keys: Object.keys(localStorage),
      cartItems: localStorage.getItem('merfy:cartItems'),
      cartId: localStorage.getItem('merfy:cartId'),
    });
  });
  log(`cart after add: ${cart1.substring(0, 800)}`);
  result.cart_after_add = cart1;

  // Take a product screenshot with cart drawer if visible
  await page.screenshot({ path: `${OUT}/order1-after-add.png`, fullPage: true });

  // Look for cart drawer / count
  const cartCount = await page.evaluate(() => {
    const txt = document.body.innerText;
    const counters = document.querySelectorAll('[data-cart-count], .cart-count, [class*="cart-count"]');
    return {
      counterCount: counters.length,
      counterTexts: Array.from(counters).map((c) => c.textContent?.trim()).slice(0, 5),
      hasCartDrawer: !!document.querySelector('.cart-drawer, [data-cart-drawer]'),
    };
  });
  log(`cart count UI: ${JSON.stringify(cartCount)}`);

  // Step 2: Navigate to /checkout — but FIRST check what cart looks like
  log('go to /checkout');
  await page.goto(`${SITE}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(4000);

  const cart2 = await page.evaluate(() => {
    return JSON.stringify({
      keys: Object.keys(localStorage),
      cartItems: localStorage.getItem('merfy:cartItems'),
      cartId: localStorage.getItem('merfy:cartId'),
    });
  });
  log(`cart at checkout: ${cart2.substring(0, 800)}`);
  result.cart_at_checkout = cart2;

  // Capture full input list
  const formInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea, select')).map((i, idx) => ({
      idx,
      tag: i.tagName,
      id: i.id,
      name: i.name,
      type: i.type,
      placeholder: i.placeholder,
      value: i.value,
      label: i.closest('label')?.textContent?.trim().substring(0, 60) || null,
      // Look at parent containers for text
      parentText: (i.parentElement?.textContent || '').trim().substring(0, 80),
      visible: i.offsetWidth > 0 && i.offsetHeight > 0,
    }));
  });
  log(`form inputs (${formInfo.length}):`);
  log(JSON.stringify(formInfo.filter((f) => f.visible || f.type === 'hidden').slice(0, 40), null, 2));

  await page.screenshot({ path: `${OUT}/order1-checkout-initial.png`, fullPage: true });

  // Try filling visible inputs by index/label match
  // Map: email, phone, country, firstName, lastName, city, street, building, apt, postalCode
  const visibleInputs = formInfo.filter((f) => f.visible && (f.type === 'text' || f.type === 'email' || f.type === 'tel'));
  log(`visible text inputs: ${visibleInputs.length}`);

  // Use a text-based approach: find inputs by their parent/label text
  const fillByLabelText = async (labelKeyword, value) => {
    const filled = await page.evaluate(({ keyword, val }) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      // Method 1: input has placeholder/label/parent text matching
      for (const inp of inputs) {
        if (!(inp.offsetWidth > 0)) continue;
        const parent = inp.closest('label') || inp.closest('div');
        const labelText = parent ? (parent.textContent || '').trim() : '';
        if (new RegExp(keyword, 'i').test(labelText) || new RegExp(keyword, 'i').test(inp.placeholder || '') || new RegExp(keyword, 'i').test(inp.id || '')) {
          // Native setter for React
          const proto = Object.getPrototypeOf(inp);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(inp, val);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, label: labelText.substring(0, 60), id: inp.id };
        }
      }
      return { ok: false };
    }, { keyword: labelKeyword, val: value });
    return filled;
  };

  log('fill email');
  log(JSON.stringify(await fillByLabelText('mail|почт', 'customer1@test.com')));
  log('fill phone');
  log(JSON.stringify(await fillByLabelText('телефон|phone', '+79991234567')));
  log('fill firstName');
  log(JSON.stringify(await fillByLabelText('^Имя$|first', 'Иван')));
  log('fill lastName');
  log(JSON.stringify(await fillByLabelText('Фамил|last', 'Тестов')));
  log('fill city');
  log(JSON.stringify(await fillByLabelText('Город', 'Москва')));
  await page.waitForTimeout(1500);
  // Click first DaData suggestion
  await page.evaluate(() => {
    const suggs = document.querySelectorAll('.dadata-suggestion, [class*="suggestion"]:not([class*="-list"])');
    if (suggs.length > 0) suggs[0].click();
  });
  await page.waitForTimeout(800);

  log('fill street');
  log(JSON.stringify(await fillByLabelText('лица|street|адрес', 'Тверская')));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const suggs = document.querySelectorAll('.dadata-suggestion, [class*="suggestion"]:not([class*="-list"])');
    if (suggs.length > 0) suggs[0].click();
  });
  await page.waitForTimeout(800);

  log('fill house/building');
  log(JSON.stringify(await fillByLabelText('^Дом$|house|building', '15')));
  log('fill apt');
  log(JSON.stringify(await fillByLabelText('Кв|apt|офис', '10')));
  log('fill postalCode');
  log(JSON.stringify(await fillByLabelText('Индекс|postal|zip', '125009')));

  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/order1-checkout-filled.png`, fullPage: true });

  // After address filled — check delivery options
  const delivery2 = await page.evaluate(() => {
    return {
      bodyText: document.body.innerText.substring(0, 3000),
      radios: Array.from(document.querySelectorAll('input[type="radio"]')).map((r) => ({
        name: r.name,
        value: r.value,
        checked: r.checked,
        visible: r.offsetWidth > 0,
        labelText: r.closest('label')?.textContent?.trim().substring(0, 100) || (r.parentElement?.textContent || '').trim().substring(0, 100),
      })),
      deliveryHeading: Array.from(document.querySelectorAll('h2, h3')).find((h) => /доставк|способ/i.test(h.textContent || ''))?.textContent?.trim(),
    };
  });
  log('delivery state after address:');
  log(JSON.stringify(delivery2, null, 2));
  result.delivery_after_address = delivery2;

  // Try to select CDEK
  const cdekSelect = await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    // Find by label text
    for (const r of radios) {
      const labelText = r.closest('label')?.textContent || (r.parentElement?.textContent || '');
      if (/сдэк|курь/i.test(labelText)) {
        r.click();
        return { selected: 'cdek-radio', labelText: labelText.substring(0, 80) };
      }
    }
    // Find by value
    for (const r of radios) {
      if (/cdek|сдэк/i.test(r.value || '')) {
        r.click();
        return { selected: 'cdek-value', value: r.value };
      }
    }
    return null;
  });
  log(`cdek select: ${JSON.stringify(cdekSelect)}`);
  await page.waitForTimeout(2500);

  // Apply promo ROSE10
  const promoFill = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const promo = inputs.find((i) => /промокод/i.test(i.placeholder || '') || /promo|discount/i.test(i.name || ''));
    if (promo) {
      const proto = Object.getPrototypeOf(promo);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(promo, 'ROSE10');
      promo.dispatchEvent(new Event('input', { bubbles: true }));
      promo.dispatchEvent(new Event('change', { bubbles: true }));
      return { filled: true, placeholder: promo.placeholder };
    }
    return { filled: false };
  });
  log(`promo filled: ${JSON.stringify(promoFill)}`);
  await page.waitForTimeout(500);

  // Click "Применить"
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /применить/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${OUT}/order1-cdek-promo.png`, fullPage: true });

  // Capture totals + state
  const finalState = await page.evaluate(() => {
    return {
      bodyText: document.body.innerText.substring(0, 3500),
      submitText: Array.from(document.querySelectorAll('button')).find((b) => /оплат|оформ|заказ/i.test(b.textContent || ''))?.textContent?.trim(),
      submitDisabled: Array.from(document.querySelectorAll('button')).find((b) => /оплат|оформ|заказ/i.test(b.textContent || ''))?.disabled,
    };
  });
  log('FINAL STATE:');
  log(JSON.stringify(finalState, null, 2));
  result.finalState = finalState;

  // Try clicking submit
  if (finalState.submitText && !finalState.submitDisabled) {
    log('clicking submit');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /оплат|оформ|заказ/i.test(b.textContent || ''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(8000);
    result.afterSubmitUrl = page.url();
    await page.screenshot({ path: `${OUT}/order1-after-submit.png`, fullPage: true });
    log(`URL after submit: ${page.url()}`);
  }
} catch (e) {
  log(`FATAL: ${e.message}`);
  errors.push(`fatal: ${e.message}\n${e.stack?.substring(0, 500)}`);
}

console.log('\n=== RESULT ===');
console.log(JSON.stringify(result, null, 2).substring(0, 4000));
console.log('\n=== ERRORS ===');
console.log(JSON.stringify(errors.slice(0, 20), null, 2));
console.log('\n=== CART/API REQUESTS ===');
console.log(requests.slice(0, 30).join('\n'));
console.log('\n=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleLogs.filter((l) => l.startsWith('error')).slice(0, 15), null, 2));

await browser.close();
