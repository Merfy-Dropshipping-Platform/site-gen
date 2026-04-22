import { exponentialBackoff, RateLimiter, sleep } from './rate-limiter.js';
import type { FigmaFile, FigmaImagesResponse, FigmaNode } from './types.js';

export interface FigmaClientOptions {
  apiKey: string;
  fileKey: string;
  limiter?: RateLimiter;
  maxRetries?: number;
}

/**
 * Minimal Figma REST client.
 * Docs: https://www.figma.com/developers/api
 */
export class FigmaRestClient {
  private readonly apiKey: string;
  private readonly fileKey: string;
  private readonly limiter: RateLimiter;
  private readonly maxRetries: number;

  constructor(opts: FigmaClientOptions) {
    this.apiKey = opts.apiKey;
    this.fileKey = opts.fileKey;
    this.limiter = opts.limiter ?? new RateLimiter(3, 5);
    this.maxRetries = opts.maxRetries ?? 4;
  }

  async getFile(opts?: { depth?: number; ids?: string[]; branch?: string }): Promise<FigmaFile> {
    const params = new URLSearchParams();
    if (opts?.depth) params.set('depth', String(opts.depth));
    if (opts?.ids?.length) params.set('ids', opts.ids.join(','));
    if (opts?.branch) params.set('branch_data', 'true');
    const qs = params.toString();
    const url = `https://api.figma.com/v1/files/${this.fileKey}${qs ? `?${qs}` : ''}`;
    return this.request<FigmaFile>(url);
  }

  async getNodes(
    nodeIds: string[],
    opts?: { depth?: number },
  ): Promise<{ nodes: Record<string, { document: FigmaNode } | null> }> {
    const params = new URLSearchParams();
    params.set('ids', nodeIds.join(','));
    if (opts?.depth) params.set('depth', String(opts.depth));
    const url = `https://api.figma.com/v1/files/${this.fileKey}/nodes?${params.toString()}`;
    return this.request(url);
  }

  async getImages(
    nodeIds: string[],
    opts?: { scale?: number; format?: 'png' | 'jpg' | 'svg' | 'pdf' },
  ): Promise<FigmaImagesResponse> {
    const params = new URLSearchParams();
    params.set('ids', nodeIds.join(','));
    params.set('format', opts?.format ?? 'png');
    params.set('scale', String(opts?.scale ?? 2));
    const url = `https://api.figma.com/v1/images/${this.fileKey}?${params.toString()}`;
    return this.request(url);
  }

  async getVariableCollections(): Promise<{ meta: { variables: unknown; variableCollections: unknown } }> {
    const url = `https://api.figma.com/v1/files/${this.fileKey}/variables/local`;
    return this.request(url);
  }

  async getMe(): Promise<{ id: string; email: string; handle: string; img_url?: string }> {
    return this.request('https://api.figma.com/v1/me');
  }

  async downloadImage(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  private async request<T>(url: string, attempt = 0): Promise<T> {
    await this.limiter.acquire();
    const res = await fetch(url, {
      headers: { 'X-Figma-Token': this.apiKey },
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= this.maxRetries) {
        throw new Error(`Figma API ${res.status} after ${attempt} retries: ${url}`);
      }
      const wait = exponentialBackoff(attempt);
      await sleep(wait);
      return this.request<T>(url, attempt + 1);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Figma API ${res.status}: ${url}\n${body.slice(0, 500)}`);
    }

    return (await res.json()) as T;
  }
}
