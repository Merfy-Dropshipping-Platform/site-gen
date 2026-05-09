import { chromium } from 'playwright';

const SITE = 'https://dde2b0280a90.merfy.ru';
const OUT = '/tmp/e2e-rose/customer';
const log = (m) => console.log(`[phase8] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
const consoleLogs = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') consoleLogs.push(`${t}: ${m.text().substring(0, 200)}`);
});
page.on('requestfailed', (req) => {
  const u = req.url();
  if (u.includes('fonts.googleapis')) return;
  errors.push(`reqfail: ${u} ${req.failure()?.errorText}`);
});

const result = {};

try {
  // Open catalog
  log('open catalog');
  await page.goto(`${SITE}/catalog`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  // Pick first product card and click on it
  const firstHandle = await page.evaluate(() => {
    const el = document.querySelector('article[data-product-handle]');
    return el ? el.getAttribute('data-product-handle') : null;
  });
  log(`first product handle: ${firstHandle}`);
  result.productHandle = firstHandle;

  // Navigate directly to product page
  await page.goto(`${SITE}/product/${firstHandle}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/order1-product.png`, fullPage: true });

  // Look for Add to Cart button
  log('looking for Add to Cart button');
  const buttonInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).map((b, i) => ({
      idx: i,
      text: (b.textContent || '').trim().substring(0, 80),
      classes: b.className.substring(0, 80),
      disabled: b.disabled,
      visible: b.offsetWidth > 0 && b.offsetHeight > 0,
    }));
    return btns.filter((b) => b.visible).slice(0, 20);
  });
  log(`visible buttons: ${JSON.stringify(buttonInfo, null, 2)}`);
  result.buttons = buttonInfo;

  // Try multiple add-to-cart selectors
  const addBtn = await page.$('button:has-text("Добавить в корзину"), button:has-text("В корзину"), button[data-add-to-cart]');
  if (addBtn) {
    log('clicking Add to Cart');
    await addBtn.click();
    await page.waitForTimeout(2000);
    result.addToCartClicked = true;
  } else {
    log('NO ADD TO CART BUTTON FOUND on product page');
    result.addToCartClicked = false;
  }

  // Check cart state via localStorage
  const cartState = await page.evaluate(() => {
    try {
      return JSON.stringify({
        merfyCart: localStorage.getItem('merfy_cart'),
        roseCart: localStorage.getItem('rose_cart'),
        cart: localStorage.getItem('cart'),
        keys: Object.keys(localStorage),
      });
    } catch (e) {
      return 'localStorage error: ' + e.message;
    }
  });
  log(`cart state: ${cartState.substring(0, 500)}`);
  result.cartState = cartState;

  // Go to checkout
  log('going to checkout');
  await page.goto(`${SITE}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/checkout-empty.png`, fullPage: true });

  // Check checkout page state
  const checkoutInfo = await page.evaluate(() => {
    return {
      title: document.title,
      cartEmpty: !!document.querySelector('[data-cart-empty], .empty-cart, [class*="empty"]'),
      forms: document.querySelectorAll('form').length,
      inputs: Array.from(document.querySelectorAll('input')).map((i) => ({
        name: i.name,
        id: i.id,
        type: i.type,
        placeholder: i.placeholder,
      })).slice(0, 30),
      h1: document.querySelector('h1')?.textContent?.trim() || null,
      h2s: Array.from(document.querySelectorAll('h2')).map((h) => h.textContent?.trim()).slice(0, 8),
      bodyText: document.body.innerText.substring(0, 2000),
    };
  });
  log('checkout info:');
  log(JSON.stringify(checkoutInfo, null, 2));
  result.checkout = checkoutInfo;

  // Try to fill the form
  const fillField = async (selectors, value) => {
    for (const s of selectors) {
      const el = await page.$(s);
      if (el) {
        try {
          await el.fill(value);
          return s;
        } catch (e) { /* try next */ }
      }
    }
    return null;
  };

  log('filling form...');
  const filled = {
    email: await fillField(['input#checkout-email', 'input[name="email"]', 'input[type="email"]'], 'customer1@test.com'),
    phone: await fillField(['input#checkout-phone', 'input[name="phone"]', 'input[type="tel"]'], '+79991234567'),
    firstName: await fillField(['input[name="firstName"]', 'input#firstName'], 'Иван'),
    lastName: await fillField(['input[name="lastName"]', 'input#lastName'], 'Тестов'),
  };
  log(`filled basic: ${JSON.stringify(filled)}`);

  // City — DaData autocomplete
  const cityFilled = await fillField(['input[name="city"]', 'input#city', '[data-field="city"] input', 'input[placeholder*="ород"]'], 'Москва');
  log(`city filled via: ${cityFilled}`);
  await page.waitForTimeout(1500);
  // Click first DaData suggestion
  const suggClicked = await page.evaluate(() => {
    const sugg = document.querySelector('.suggestions-suggestion, .dadata-suggestion, [class*="suggestion"]:not([class*="-list"])');
    if (sugg) {
      sugg.click();
      return true;
    }
    return false;
  });
  log(`city DaData suggestion clicked: ${suggClicked}`);
  await page.waitForTimeout(800);

  // Address / street
  const addrFilled = await fillField(['input[name="address"]', 'input#address', 'input[name="street"]', '[data-field="address"] input', 'input[placeholder*="лица"]'], 'улица Тверская');
  log(`address filled via: ${addrFilled}`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const sugg = document.querySelector('.suggestions-suggestion, .dadata-suggestion, [class*="suggestion"]:not([class*="-list"])');
    if (sugg) sugg.click();
  });
  await page.waitForTimeout(800);

  await fillField(['input[name="building"]', 'input[name="house"]', 'input#house'], '15');
  await fillField(['input[name="postalCode"]', 'input[name="index"]', 'input#postalCode'], '123100');

  await page.screenshot({ path: `${OUT}/checkout-filled.png`, fullPage: true });

  // Inspect delivery options
  log('inspecting delivery options');
  const delivery = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label')).map((l) => ({
      text: (l.textContent || '').trim().substring(0, 100),
      hasInput: !!l.querySelector('input'),
      inputValue: l.querySelector('input')?.value,
      inputName: l.querySelector('input')?.name,
    })).filter((l) => /дост|курь|пвз|самов|почт|сдэк/i.test(l.text));
    const radios = Array.from(document.querySelectorAll('input[type="radio"]')).map((r) => ({
      name: r.name,
      value: r.value,
      labelText: r.closest('label')?.textContent?.trim().substring(0, 100) || null,
    }));
    return { labels, radios };
  });
  log('delivery options:');
  log(JSON.stringify(delivery, null, 2));
  result.delivery = delivery;

  // Select CDEK if available
  const cdekClicked = await page.evaluate(() => {
    // Try by value containing cdek
    const cdek = document.querySelector('input[type="radio"][value*="cdek" i], input[type="radio"][value*="сдэк" i]');
    if (cdek) {
      cdek.click();
      return 'value-cdek';
    }
    // Try by label text
    const labelCdek = Array.from(document.querySelectorAll('label')).find((l) => /сдэк|курь/i.test(l.textContent || ''));
    if (labelCdek) {
      const inp = labelCdek.querySelector('input');
      if (inp) {
        inp.click();
        return 'label-cdek';
      }
      labelCdek.click();
      return 'label-click';
    }
    return null;
  });
  log(`CDEK selected via: ${cdekClicked}`);
  await page.waitForTimeout(2000);

  // Apply promo code ROSE10
  log('applying promo ROSE10');
  const promoToggleClicked = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('button, a, summary, [role="button"]'))
      .find((el) => /промокод|купон|скидк/i.test(el.textContent || ''));
    if (t) { t.click(); return (t.textContent || '').trim().substring(0, 60); }
    return null;
  });
  log(`promo toggle: ${promoToggleClicked}`);
  await page.waitForTimeout(800);

  const promoFilled = await fillField(['input[name="promoCode"]', 'input[placeholder*="ромокод" i]', 'input[name="discountCode"]', 'input[id*="promo" i]'], 'ROSE10');
  log(`promo filled via: ${promoFilled}`);

  if (promoFilled) {
    const applyBtn = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /применить|apply/i.test(b.textContent || ''));
      if (btn) { btn.click(); return (btn.textContent || '').trim().substring(0, 60); }
      return null;
    });
    log(`apply btn clicked: ${applyBtn}`);
    await page.waitForTimeout(2500);
  }

  await page.screenshot({ path: `${OUT}/checkout-cdek-promo.png`, fullPage: true });

  // Capture totals
  const totals = await page.evaluate(() => {
    const text = document.body.innerText;
    const m = text.match(/итог[оа]\S?\s*[\d\s]+[₽р]/i);
    const allMoney = (text.match(/(\d[\d\s]*\d|\d)\s*[₽р]/g) || []).slice(0, 30);
    return { match: m?.[0], allMoney };
  });
  log(`totals: ${JSON.stringify(totals)}`);
  result.totals = totals;

  // Try to submit
  log('looking for submit button');
  const submitInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetWidth > 0);
    const submit = btns.find((b) => /оплат|заказ|оформ|перейти|подтвердить/i.test(b.textContent || ''));
    return submit ? {
      text: (submit.textContent || '').trim().substring(0, 80),
      disabled: submit.disabled,
      type: submit.type,
    } : null;
  });
  log(`submit btn: ${JSON.stringify(submitInfo)}`);
  result.submit = submitInfo;

  if (submitInfo && !submitInfo.disabled) {
    const submitBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button'))
        .filter((b) => b.offsetWidth > 0)
        .find((b) => /оплат|заказ|оформ|перейти|подтвердить/i.test(b.textContent || ''));
    });
    if (submitBtn) {
      log('clicking submit');
      await submitBtn.asElement()?.click().catch((e) => log(`click err: ${e.message}`));
      await page.waitForTimeout(6000);
      result.afterSubmitUrl = page.url();
      log(`URL after submit: ${page.url()}`);
      await page.screenshot({ path: `${OUT}/checkout-after-submit.png`, fullPage: true });
    }
  } else {
    log('submit disabled or not found, capturing state');
  }
} catch (e) {
  log(`FATAL: ${e.message}\n${e.stack}`);
  errors.push(`fatal: ${e.message}`);
}

console.log('\n=== RESULT ===');
console.log(JSON.stringify(result, null, 2));
console.log('\n=== ERRORS ===');
console.log(JSON.stringify(errors.slice(0, 30), null, 2));
console.log('\n=== CONSOLE ===');
console.log(JSON.stringify(consoleLogs.slice(0, 30), null, 2));

await browser.close();
