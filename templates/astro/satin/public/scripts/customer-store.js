/**
 * Customer session store — manages auth token in localStorage.
 * Used by customer-auth.js and all account/* pages.
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'merfy_customer_token';

  window.CustomerStore = {
    /** Save customer token */
    saveToken(token) {
      try {
        localStorage.setItem(STORAGE_KEY, token);
      } catch (e) {
        console.warn('[CustomerStore] Failed to save token:', e);
      }
    },

    /** Get stored token or null */
    getToken() {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch (e) {
        return null;
      }
    },

    /** Clear token (logout) */
    clearToken() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn('[CustomerStore] Failed to clear token:', e);
      }
    },

    /** Check if customer is logged in */
    isLoggedIn() {
      return !!this.getToken();
    },

    /** Get Authorization header value */
    getAuthHeader() {
      const token = this.getToken();
      return token ? `Bearer ${token}` : null;
    },
  };
})();
