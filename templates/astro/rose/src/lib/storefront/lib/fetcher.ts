export class StoreFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`StoreFetch error: ${status} ${statusText}`);
    this.name = 'StoreFetchError';
  }
}

export async function storeFetch<T = unknown>(
  apiBase: string,
  storeId: string,
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const url = `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Store-Id': storeId,
    ...(options.headers as Record<string, string> || {}),
  };

  const { body: rawBody, ...restOptions } = options;

  const fetchOptions: RequestInit = {
    ...restOptions,
    headers,
  };

  if (rawBody !== undefined && rawBody !== null) {
    fetchOptions.body = JSON.stringify(rawBody);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }
    throw new StoreFetchError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
