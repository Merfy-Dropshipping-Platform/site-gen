import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storeFetch, StoreFetchError } from '../../lib/fetcher';

describe('storeFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // T005: Test storeFetch success
  describe('successful responses', () => {
    it('parses JSON response correctly', async () => {
      const mockData = { id: 1, name: 'Test Product' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      });

      const result = await storeFetch<typeof mockData>(
        'https://api.example.com',
        'store-123',
        '/products',
      );

      expect(result).toEqual(mockData);
    });

    it('sends X-Store-Id header', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await storeFetch('https://api.example.com', 'store-abc', '/test');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Store-Id': 'store-abc',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('prepends / to path when missing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await storeFetch('https://api.example.com', 'store-1', 'products');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/products',
        expect.anything(),
      );
    });

    it('does not double-prepend / when path starts with /', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await storeFetch('https://api.example.com', 'store-1', '/products');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/products',
        expect.anything(),
      );
    });

    it('stringifies body when provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      const body = { name: 'New Product', price: 100 };
      await storeFetch('https://api.example.com', 'store-1', '/products', {
        method: 'POST',
        body,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/products',
        expect.objectContaining({
          body: JSON.stringify(body),
          method: 'POST',
        }),
      );
    });
  });

  // T006: Test storeFetch error (HTTP 500)
  describe('error responses', () => {
    it('throws StoreFetchError on HTTP 500 with JSON body', async () => {
      const errorBody = { message: 'Internal Server Error' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve(errorBody),
      });

      await expect(
        storeFetch('https://api.example.com', 'store-1', '/fail'),
      ).rejects.toThrow(StoreFetchError);

      try {
        await storeFetch('https://api.example.com', 'store-1', '/fail');
      } catch (error) {
        expect(error).toBeInstanceOf(StoreFetchError);
        const fetchError = error as StoreFetchError;
        expect(fetchError.status).toBe(500);
        expect(fetchError.statusText).toBe('Internal Server Error');
        expect(fetchError.body).toEqual(errorBody);
      }
    });

    it('throws StoreFetchError on HTTP 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'not found' }),
      });

      await expect(
        storeFetch('https://api.example.com', 'store-1', '/missing'),
      ).rejects.toThrow(StoreFetchError);
    });
  });

  // T007: Test storeFetch 204 No Content
  describe('204 No Content', () => {
    it('returns undefined for 204 responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('No content')),
      });

      const result = await storeFetch('https://api.example.com', 'store-1', '/delete');

      expect(result).toBeUndefined();
    });
  });

  // T008: Test storeFetch non-JSON error body
  describe('non-JSON error body', () => {
    it('falls back to text body when JSON parsing fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('not JSON')),
        text: () => Promise.resolve('<!DOCTYPE html><html>Gateway Error</html>'),
      });

      try {
        await storeFetch('https://api.example.com', 'store-1', '/gateway');
      } catch (error) {
        expect(error).toBeInstanceOf(StoreFetchError);
        const fetchError = error as StoreFetchError;
        expect(fetchError.status).toBe(502);
        expect(fetchError.statusText).toBe('Bad Gateway');
        expect(fetchError.body).toBe('<!DOCTYPE html><html>Gateway Error</html>');
      }
    });

    it('returns null body when both JSON and text parsing fail', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('not JSON')),
        text: () => Promise.reject(new Error('stream consumed')),
      });

      try {
        await storeFetch('https://api.example.com', 'store-1', '/broken');
      } catch (error) {
        expect(error).toBeInstanceOf(StoreFetchError);
        const fetchError = error as StoreFetchError;
        expect(fetchError.status).toBe(500);
        expect(fetchError.body).toBeNull();
      }
    });
  });
});
