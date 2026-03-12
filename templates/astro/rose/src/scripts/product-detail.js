/**
 * Product Detail page interactivity (Redesign v2)
 * - Thumbnail gallery switching with active highlight
 * - GLightbox for zoom/fullscreen
 * - Grouped variant selection (color + size pills)
 * - Cross-group combination resolution
 * - Quantity +/- controls
 * - Cart integration (add to cart / buy now)
 * - Share functionality
 */

(function () {
  'use strict';

  // --- State ---
  var quantity = 1;
  var selectedOptions = {}; // { "Цвет": "Черный", "Размер": "S" }
  var selectedVariantId = null;
  var allVariants = []; // Full variants array from data-variants

  // --- DOM refs ---
  var mainImage = document.getElementById('main-product-image');
  var mainContainer = document.getElementById('main-image-container');
  var thumbnailStrip = document.getElementById('thumbnail-strip');
  var qtyDisplay = document.getElementById('qty-display');
  var qtyMinus = document.getElementById('qty-minus');
  var qtyPlus = document.getElementById('qty-plus');
  var addToCartBtn = document.getElementById('add-to-cart-btn');
  var buyNowBtn = document.getElementById('buy-now-btn');
  var priceDisplay = document.getElementById('price-display');
  var variantsContainer = document.getElementById('variants-container');
  var variantsContainerFlat = document.getElementById('variants-container-flat');
  var shareBtn = document.getElementById('share-btn');

  // --- Styles ---
  var STYLE_SELECTED = 'background: rgb(var(--color-foreground)); border: 1px solid rgb(var(--color-foreground)); color: rgb(var(--color-background));';
  var STYLE_OUTLINED = 'background: transparent; border: 1px solid rgb(var(--color-foreground)); color: rgb(var(--color-foreground));';
  var STYLE_DISABLED = 'background: rgba(153,153,153,0.05); border: 1px solid rgb(var(--color-muted)); color: rgb(var(--color-muted)); text-decoration: line-through; cursor: not-allowed;';
  var STYLE_BASE = 'height: 60px; padding: 10px 20px; font-size: 20px; line-height: 27px; border-radius: 10px; ';

  // --- Gallery: thumbnail switching ---
  if (thumbnailStrip) {
    thumbnailStrip.addEventListener('click', function (e) {
      var btn = e.target.closest('.thumb-btn');
      if (!btn) return;

      var newSrc = btn.dataset.src;
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
    var imagesRaw = mainContainer.dataset.images;
    var images = [];
    try {
      images = JSON.parse(imagesRaw || '[]');
    } catch (e) {
      images = [];
    }

    if (images.length > 0) {
      var lightboxElements = images.map(function (src) {
        return { href: src, type: 'image' };
      });

      var lightbox = GLightbox({
        elements: lightboxElements,
        touchNavigation: true,
        zoomable: true,
        draggable: true,
      });

      mainContainer.addEventListener('click', function () {
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

  // --- Grouped Variant Selection ---
  if (variantsContainer) {
    // Parse all variants from data attribute
    try {
      allVariants = JSON.parse(variantsContainer.dataset.variants || '[]');
    } catch (e) {
      allVariants = [];
    }

    var pills = variantsContainer.querySelectorAll('.variant-pill');

    // Initialize: pre-select first available value in each group
    var groups = variantsContainer.querySelectorAll('[data-group-key]');
    groups.forEach(function (groupEl) {
      var groupKey = groupEl.dataset.groupKey;
      var groupPills = groupEl.querySelectorAll('.variant-pill:not([disabled])');
      if (groupPills.length > 0) {
        selectedOptions[groupKey] = groupPills[0].dataset.value;
      }
    });

    // Resolve initial variant
    resolveVariant();

    // Click handler for pills
    variantsContainer.addEventListener('click', function (e) {
      var pill = e.target.closest('.variant-pill');
      if (!pill || pill.disabled) return;

      var group = pill.dataset.group;
      var value = pill.dataset.value;

      // Update selected option for this group
      selectedOptions[group] = value;

      // Update pill styles within this group
      var groupEl = pill.closest('[data-group-key]');
      if (groupEl) {
        groupEl.querySelectorAll('.variant-pill').forEach(function (p) {
          if (p.disabled) {
            p.style.cssText = STYLE_BASE + STYLE_DISABLED;
          } else if (p.dataset.value === value) {
            p.style.cssText = STYLE_BASE + STYLE_SELECTED;
          } else {
            p.style.cssText = STYLE_BASE + STYLE_OUTLINED;
          }
        });
      }

      // Resolve matching combination
      resolveVariant();
    });
  }

  // --- Flat Variant Selection (fallback) ---
  if (variantsContainerFlat) {
    var flatBtns = variantsContainerFlat.querySelectorAll('.variant-btn');

    if (flatBtns.length > 0) {
      selectedVariantId = flatBtns[0].dataset.variantId || null;
    }

    variantsContainerFlat.addEventListener('click', function (e) {
      var btn = e.target.closest('.variant-btn');
      if (!btn || btn.disabled) return;

      selectedVariantId = btn.dataset.variantId || null;

      flatBtns.forEach(function (b) {
        if (b.disabled) {
          b.style.cssText = STYLE_BASE + STYLE_DISABLED;
        } else if (b === btn) {
          b.style.cssText = STYLE_BASE + STYLE_SELECTED;
        } else {
          b.style.cssText = STYLE_BASE + STYLE_OUTLINED;
        }
      });

      var variantPrice = btn.dataset.price;
      if (variantPrice && priceDisplay) {
        priceDisplay.textContent = variantPrice;
      }
    });
  }

  // --- Resolve variant from selected options ---
  function resolveVariant() {
    if (allVariants.length === 0) return;

    var optionKeys = Object.keys(selectedOptions);
    if (optionKeys.length === 0) return;

    // Find the variant where ALL options match
    var match = null;
    for (var i = 0; i < allVariants.length; i++) {
      var v = allVariants[i];
      if (!v.options) continue;
      var allMatch = true;
      for (var k = 0; k < optionKeys.length; k++) {
        var key = optionKeys[k];
        if (v.options[key] !== selectedOptions[key]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        match = v;
        break;
      }
    }

    if (match) {
      selectedVariantId = match.id;
      if (priceDisplay && match.price) {
        priceDisplay.textContent = match.price;
      }
    } else {
      selectedVariantId = null;
    }
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

      // Check if variant must be selected
      if (variantsContainer && !selectedVariantId) {
        addToCartBtn.textContent = 'Выберите вариант';
        addToCartBtn.style.borderColor = 'rgb(var(--color-primary))';
        setTimeout(function () {
          addToCartBtn.textContent = 'Добавить в корзину';
          addToCartBtn.style.borderColor = 'rgb(var(--color-foreground))';
        }, 1500);
        return;
      }

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

      // Check if variant must be selected
      if (variantsContainer && !selectedVariantId) {
        buyNowBtn.textContent = 'Выберите вариант';
        setTimeout(function () {
          buyNowBtn.textContent = 'Купить сейчас';
        }, 1500);
        return;
      }

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
