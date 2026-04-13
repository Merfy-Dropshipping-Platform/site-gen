/**
 * checkout-auth.js
 *
 * Inline auth gate for checkout page.
 * Handles:
 * - requireCustomerAuth=true: shows auth gate, hides checkout form
 * - requireCustomerAuth=false: shows "Already have account?" link
 * - Tab switching between Login/Register
 * - Login/Register form submission
 * - After auth: shows checkout form with autofill from profile
 */
(function () {
  'use strict';

  function init() {
    var config = window.__MERFY_CONFIG__ || {};
    var isLoggedIn = window.CustomerStore && window.CustomerStore.isLoggedIn();
    var authGate = document.getElementById('co-auth-gate');
    var checkoutForm = document.getElementById('co-checkout-form');
    var loginLink = document.getElementById('co-login-link');

    if (!authGate || !checkoutForm) return;

    if (config.requireCustomerAuth && !isLoggedIn) {
      // Show auth gate, hide checkout form
      authGate.style.display = '';
      checkoutForm.style.display = 'none';
    } else {
      // Show checkout form
      authGate.style.display = 'none';
      checkoutForm.style.display = '';

      // Show "Already have account?" link for optional mode
      if (!config.requireCustomerAuth && !isLoggedIn && loginLink) {
        loginLink.style.display = '';
      }

      // Autofill from profile if logged in
      if (isLoggedIn) {
        autofillFromProfile();
      }
    }

    // Tab switching
    var tabs = authGate.querySelectorAll('.co-auth-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');
        tabs.forEach(function (t) { t.classList.remove('co-auth-tab--active'); });
        tab.classList.add('co-auth-tab--active');
        document.getElementById('co-auth-login').style.display = target === 'login' ? '' : 'none';
        document.getElementById('co-auth-register').style.display = target === 'register' ? '' : 'none';
      });
    });

    // Login form
    var loginBtn = document.getElementById('co-auth-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', handleLogin);
    }

    // Register form
    var registerBtn = document.getElementById('co-auth-register-btn');
    if (registerBtn) {
      registerBtn.addEventListener('click', handleRegister);
    }

    // "Already have account?" link
    if (loginLink) {
      loginLink.addEventListener('click', function (e) {
        e.preventDefault();
        authGate.style.display = '';
        checkoutForm.style.display = 'none';
      });
    }
  }

  function handleLogin() {
    var email = document.getElementById('co-auth-email').value.trim();
    var password = document.getElementById('co-auth-password').value;
    var errorEl = document.getElementById('co-auth-login-error');
    var btn = document.getElementById('co-auth-login-btn');

    if (!email || !password) {
      showError(errorEl, 'Заполните email и пароль');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Входим...';
    errorEl.style.display = 'none';

    window.CustomerAuth.login({ email: email, password: password })
      .then(function () {
        onAuthSuccess();
      })
      .catch(function (err) {
        var msg = 'Неверный email или пароль';
        if (err && err.error === 'ACCOUNT_LOCKED') {
          msg = 'Аккаунт заблокирован. Попробуйте позже.';
        }
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = 'Войти';
      });
  }

  function handleRegister() {
    var email = document.getElementById('co-auth-reg-email').value.trim();
    var name = document.getElementById('co-auth-reg-name').value.trim();
    var password = document.getElementById('co-auth-reg-password').value;
    var confirm = document.getElementById('co-auth-reg-confirm').value;
    var errorEl = document.getElementById('co-auth-register-error');
    var btn = document.getElementById('co-auth-register-btn');

    if (!email || !name || !password) {
      showError(errorEl, 'Заполните все поля');
      return;
    }
    if (password.length < 8) {
      showError(errorEl, 'Пароль должен быть не менее 8 символов');
      return;
    }
    if (password !== confirm) {
      showError(errorEl, 'Пароли не совпадают');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Регистрируем...';
    errorEl.style.display = 'none';

    window.CustomerAuth.register({ email: email, name: name, password: password })
      .then(function () {
        onAuthSuccess();
      })
      .catch(function (err) {
        var msg = 'Ошибка регистрации';
        if (err && err.code === 'EMAIL_EXISTS') {
          msg = 'Аккаунт уже существует. Попробуйте войти.';
          // Switch to login tab
          var tabs = document.querySelectorAll('.co-auth-tab');
          tabs.forEach(function (t) { t.classList.remove('co-auth-tab--active'); });
          tabs[0].classList.add('co-auth-tab--active');
          document.getElementById('co-auth-login').style.display = '';
          document.getElementById('co-auth-register').style.display = 'none';
          document.getElementById('co-auth-email').value = email;
        }
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = 'Зарегистрироваться';
      });
  }

  function onAuthSuccess() {
    var authGate = document.getElementById('co-auth-gate');
    var checkoutForm = document.getElementById('co-checkout-form');
    authGate.style.display = 'none';
    checkoutForm.style.display = '';
    autofillFromProfile();
  }

  function autofillFromProfile() {
    if (!window.CustomerAuth) return;

    window.CustomerAuth.me()
      .then(function (result) {
        if (!result || !result.data) return;
        var customer = result.data.customer || result.data;

        // Store customerId for checkout
        window.__MERFY_CUSTOMER_ID__ = customer.id || null;

        // Autofill form fields
        var emailField = document.getElementById('co-email');
        var phoneField = document.getElementById('co-phone');
        var firstNameField = document.getElementById('co-firstName');

        if (emailField && customer.email && !emailField.value) {
          emailField.value = customer.email;
        }
        if (phoneField && customer.phone && !phoneField.value) {
          phoneField.value = customer.phone;
        }
        if (firstNameField && customer.name && !firstNameField.value) {
          firstNameField.value = customer.name;
        }

        // Autofill address if available
        var addr = customer.defaultAddress;
        if (addr) {
          var cityField = document.getElementById('co-city');
          var streetField = document.getElementById('co-street');
          var houseField = document.getElementById('co-house');
          var postalField = document.getElementById('co-postal-code');
          var apartmentField = document.getElementById('co-apartment');
          var addressSearch = document.getElementById('co-address-search');

          if (cityField && addr.city) cityField.value = addr.city;
          if (streetField && addr.street) streetField.value = addr.street;
          if (houseField && addr.building) houseField.value = addr.building;
          if (postalField && addr.postalCode) postalField.value = addr.postalCode;
          if (apartmentField && addr.apartment) apartmentField.value = addr.apartment;

          // Build display address for the search field
          var parts = [addr.city, addr.street, addr.building].filter(Boolean);
          if (parts.length > 0 && addressSearch && !addressSearch.value) {
            addressSearch.value = parts.join(', ');
          }
        }
      })
      .catch(function () {
        // Silent fail — autofill is best-effort
      });
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
  }

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
