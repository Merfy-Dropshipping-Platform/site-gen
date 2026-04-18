/**
 * Customer Auth API client.
 * Reads window.__MERFY_CONFIG__ for apiUrl and storeId.
 * Uses CustomerStore for token management.
 */
(function() {
  'use strict';

  function getConfig() {
    const config = window.__MERFY_CONFIG__ || {};
    return {
      apiUrl: config.apiUrl || '',
      storeId: config.storeId || config.shopId || config.siteId || '',
    };
  }

  async function request(path, options = {}) {
    const { apiUrl } = getConfig();
    const url = `${apiUrl}${path}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth header if token exists
    const authHeader = window.CustomerStore?.getAuthHeader();
    if (authHeader && !headers['Authorization']) {
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok && !data.success) {
      throw { status: response.status, ...data };
    }

    return data;
  }

  window.CustomerAuth = {
    /** Register new customer */
    async register({ email, name, password }) {
      const { storeId } = getConfig();
      const result = await request('/store/auth/register', {
        method: 'POST',
        body: JSON.stringify({ store_id: storeId, email, name, password }),
      });

      if (result.success && result.data?.sessionToken) {
        window.CustomerStore.saveToken(result.data.sessionToken);
      }
      return result;
    },

    /** Login */
    async login({ email, password }) {
      const { storeId } = getConfig();
      const result = await request('/store/auth/login', {
        method: 'POST',
        body: JSON.stringify({ store_id: storeId, email, password }),
      });

      if (result.success && result.data?.sessionToken) {
        window.CustomerStore.saveToken(result.data.sessionToken);
      }
      return result;
    },

    /** Logout */
    async logout() {
      try {
        await request('/store/auth/logout', { method: 'POST' });
      } catch (e) {
        // Ignore errors on logout — clear token anyway
      }
      window.CustomerStore.clearToken();
    },

    /** Get current customer profile */
    async me() {
      return request('/store/auth/me');
    },

    /** Update profile */
    async updateProfile(data) {
      return request('/store/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    /** Request password reset */
    async forgotPassword({ email }) {
      const { storeId } = getConfig();
      return request('/store/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ store_id: storeId, email }),
      });
    },

    /** Reset password with token */
    async resetPassword({ token, password }) {
      const result = await request('/store/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      if (result.success && result.data?.sessionToken) {
        window.CustomerStore.saveToken(result.data.sessionToken);
      }
      return result;
    },

    /** Verify email */
    async verifyEmail({ token }) {
      return request('/store/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },

    // ==================== OTP Password Reset (новый flow) ====================

    /** Request 4-digit OTP code for password reset */
    async requestResetOTP({ email, shopName }) {
      const { storeId } = getConfig();
      return request('/store/auth/request-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ shopId: storeId, email, shopName }),
      });
    },

    /** Verify OTP — returns { resetCredential, expiresAt } */
    async verifyResetOTP({ email, code }) {
      const { storeId } = getConfig();
      return request('/store/auth/verify-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ shopId: storeId, email, code }),
      });
    },

    /** Resend OTP */
    async resendResetOTP({ email, shopName }) {
      const { storeId } = getConfig();
      return request('/store/auth/resend-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ shopId: storeId, email, shopName }),
      });
    },

    /** Set new password using reset credential */
    async setNewPassword({ resetCredential, password }) {
      return request('/store/auth/set-new-password', {
        method: 'POST',
        body: JSON.stringify({ resetCredential, password }),
      });
    },

    /** Resend email verification link */
    async resendVerification({ email }) {
      const { storeId } = getConfig();
      return request('/store/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ shopId: storeId, email }),
      });
    },
  };
})();
