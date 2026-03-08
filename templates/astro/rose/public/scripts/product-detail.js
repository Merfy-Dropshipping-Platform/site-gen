/**
 * Product Detail page interactivity
 * - Thumbnail gallery switching
 * - GLightbox for zoom/fullscreen
 * - Variant selection with price update
 * - Quantity +/- controls
 * - Cart integration (add to cart / buy now)
 */

(function () {
  'use strict';

  // --- State ---
  let quantity = 1;
  let selectedVariantId = null;

  // --- DOM refs ---
  const mainImage = document.getElementById('main-product-image');
  const mainContainer = document.getElementById('main-image-container');
  const thumbnailStrip = document.getElementById('thumbnail-strip');
  const qtyDisplay = document.getElementById('qty-display');
  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus = document.getElementById('qty-plus');
  const addToCartBtn = document.getElementById('add-to-cart-btn');
  const buyNowBtn = document.getElementById('buy-now-btn');
  const priceDisplay = document.getElementById('price-display');
  const variantsContainer = document.getElementById('variants-container');
  const shareBtn = document.getElementById('share-btn');

  // --- Gallery: thumbnail switching ---
  if (thumbnailStrip) {
    thumbnailStrip.addEventListener('click', function (e) {
      const btn = e.target.closest('.thumb-btn');
      if (!btn) return;

      const newSrc = btn.dataset.src;
      if (!newSrc || !mainImage) return;

      mainImage.src = newSrc;

      // Update active border on thumbnails
      thumbnailStrip.querySelectorAll('.thumb-btn').forEach(function (t) {
        t.style.borderColor = 'transparent';
      });
      btn.style.borderColor = 'rgb(var(--color-primary))';
    });
  }

  // --- Lightbox: GLightbox ---
  if (mainContainer && typeof GLightbox !== 'undefined') {
    const imagesRaw = mainContainer.dataset.images;
    let images = [];
    try {
      images = JSON.parse(imagesRaw || '[]');
    } catch (e) {
      images = [];
    }

    if (images.length > 0) {
      const lightboxElements = images.map(function (src) {
        return { href: src, type: 'image' };
      });

      const lightbox = GLightbox({
        elements: lightboxElements,
        touchNavigation: true,
        zoomable: true,
        draggable: true,
      });

      mainContainer.addEventListener('click', function () {
        // Find current image index
        var currentSrc = mainImage ? mainImage.src : '';
        var startAt = 0;
        for (var i = 0; i < images.length; i++) {
          if (currentSrc.endsWith(images[i]) || currentSrc === images[i]) {
            startAt = i;
            break;
          }
        }
        lightbox.openAt(startAt);
      });
    }
  }

  // --- Variants ---
  if (variantsContainer) {
    var variantBtns = variantsContainer.querySelectorAll('.variant-btn');

    // First available variant is pre-selected (index 0)
    if (variantBtns.length > 0) {
      selectedVariantId = variantBtns[0].dataset.variantId || null;
    }

    variantsContainer.addEventListener('click', function (e) {
      var btn = e.target.closest('.variant-btn');
      if (!btn || btn.disabled) return;

      selectedVariantId = btn.dataset.variantId || null;

      // Update styles: active = primary bg, others = secondary bg
      variantBtns.forEach(function (b) {
        if (b === btn) {
          b.style.background = 'rgb(var(--color-primary))';
          b.style.color = 'rgb(var(--color-button-text))';
        } else {
          b.style.background = 'rgb(var(--color-secondary))';
          b.style.color = 'rgb(var(--color-foreground))';
        }
      });

      // Update price if variant has different price
      var variantPrice = btn.dataset.price;
      if (variantPrice && priceDisplay) {
        priceDisplay.textContent = variantPrice;
      }
    });
  }

  // --- Quantity +/- ---
  if (qtyMinus) {
    qtyMinus.addEventListener('click', function () {
      if (quantity > 1) {
        quantity--;
        if (qtyDisplay) qtyDisplay.textContent = quantity;
      }
    });
  }

  if (qtyPlus) {
    qtyPlus.addEventListener('click', function () {
      quantity++;
      if (qtyDisplay) qtyDisplay.textContent = quantity;
    });
  }

  // --- Cart integration ---
  function getProductData(btn) {
    return {
      productId: btn ? btn.dataset.productId : null,
      productSlug: btn ? btn.dataset.productSlug : null,
    };
  }

  if (addToCartBtn) {
    addToCartBtn.addEventListener('click', async function () {
      var data = getProductData(addToCartBtn);
      if (!data.productId) return;

      addToCartBtn.disabled = true;
      addToCartBtn.textContent = 'Добавляем...';

      try {
        if (window.cartStore && typeof window.cartStore.addItem === 'function') {
          var success = await window.cartStore.addItem(
            data.productId,
            selectedVariantId,
            quantity,
          );
          if (success) {
            addToCartBtn.textContent = 'Добавлено!';
            setTimeout(function () {
              addToCartBtn.textContent = 'Добавить в корзину';
              addToCartBtn.disabled = false;
            }, 1500);
            return;
          }
        }
      } catch (e) {
        // fallback
      }

      addToCartBtn.textContent = 'Добавить в корзину';
      addToCartBtn.disabled = false;
    });
  }

  if (buyNowBtn) {
    buyNowBtn.addEventListener('click', async function () {
      var data = getProductData(buyNowBtn);
      if (!data.productId) return;

      buyNowBtn.disabled = true;
      buyNowBtn.textContent = 'Оформляем...';

      try {
        if (window.cartStore && typeof window.cartStore.addItem === 'function') {
          await window.cartStore.addItem(
            data.productId,
            selectedVariantId,
            quantity,
          );
        }
      } catch (e) {
        // continue to checkout anyway
      }

      window.location.href = '/checkout?productId=' + (data.productSlug || data.productId);
    });
  }

  // --- Share ---
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({
          title: document.title,
          url: window.location.href,
        }).catch(function () {});
      } else {
        // Fallback: copy URL
        navigator.clipboard.writeText(window.location.href).then(function () {
          var span = shareBtn.querySelector('span');
          if (span) {
            var orig = span.textContent;
            span.textContent = 'Ссылка скопирована!';
            setTimeout(function () {
              span.textContent = orig;
            }, 1500);
          }
        }).catch(function () {});
      }
    });
  }
})();
