import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { $wishlist, $wishlistSyncStatus } from '../../wishlist/store';
import { syncOnLogin, queueAdd, queueRemove, _resetSync } from '../../wishlist/sync';
import { wishlistApi } from '../../wishlist/api';

vi.mock('../../wishlist/api', () => ({
  wishlistApi: {
    list: vi.fn(),
    replace: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
}));

describe('Wishlist sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    $wishlist.set([]);
    $wishlistSyncStatus.set('idle');
    _resetSync();
    vi.mocked(wishlistApi.list).mockReset();
    vi.mocked(wishlistApi.replace).mockReset();
    vi.mocked(wishlistApi.add).mockReset();
    vi.mocked(wishlistApi.remove).mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('syncOnLogin: union local+server, takes min(addedAt), PUTs result', async () => {
    $wishlist.set([{ productId: 'A', addedAt: 1000 }]);
    vi.mocked(wishlistApi.list).mockResolvedValue([
      { productId: 'A', addedAt: 500 },
      { productId: 'B', addedAt: 2000 },
    ]);
    vi.mocked(wishlistApi.replace).mockResolvedValue([
      { productId: 'A', addedAt: 500 },
      { productId: 'B', addedAt: 2000 },
    ]);
    await syncOnLogin();
    const items = $wishlist.get();
    expect(items).toHaveLength(2);
    const a = items.find((i) => i.productId === 'A')!;
    expect(a.addedAt).toBe(500);
    expect(vi.mocked(wishlistApi.replace)).toHaveBeenCalledOnce();
  });

  it('queueAdd: debounced 500ms, then POST /items', async () => {
    vi.mocked(wishlistApi.add).mockResolvedValue({ productId: 'X', addedAt: 0 });
    queueAdd('X');
    expect(vi.mocked(wishlistApi.add)).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(wishlistApi.add)).toHaveBeenCalledWith('X');
  });

  it('queueAdd: multiple within debounce window each get a call (one per item)', async () => {
    vi.mocked(wishlistApi.add).mockResolvedValue({ productId: 'any', addedAt: 0 });
    queueAdd('X');
    queueAdd('Y');
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.mocked(wishlistApi.add)).toHaveBeenCalledTimes(2);
  });

  it('on add error: status=error, item remains local, retried with backoff', async () => {
    vi.mocked(wishlistApi.add)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ productId: 'X', addedAt: 0 });
    queueAdd('X');
    await vi.advanceTimersByTimeAsync(500);
    expect($wishlistSyncStatus.get()).toBe('error');
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.mocked(wishlistApi.add)).toHaveBeenCalledTimes(2);
    expect($wishlistSyncStatus.get()).toBe('idle');
  });
});
