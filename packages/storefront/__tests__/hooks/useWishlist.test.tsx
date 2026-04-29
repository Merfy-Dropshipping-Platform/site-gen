import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWishlist } from '../../wishlist/useWishlist';
import { $wishlist } from '../../wishlist/store';

vi.mock('../../wishlist/sync', () => ({
  queueAdd: vi.fn(),
  queueRemove: vi.fn(),
  syncOnLogin: vi.fn(),
}));

describe('useWishlist hook', () => {
  beforeEach(() => $wishlist.set([]));

  it('initial: count=0, items=[]', () => {
    const { result } = renderHook(() => useWishlist());
    expect(result.current.count).toBe(0);
    expect(result.current.items).toEqual([]);
  });

  it('toggle adds new and isInWishlist returns true', () => {
    const { result } = renderHook(() => useWishlist());
    act(() => result.current.toggle('prod_a'));
    expect(result.current.isInWishlist('prod_a')).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it('toggle on existing removes it', () => {
    const { result } = renderHook(() => useWishlist());
    act(() => result.current.toggle('prod_a'));
    act(() => result.current.toggle('prod_a'));
    expect(result.current.isInWishlist('prod_a')).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('add at limit (200): no-op, count stays 200', () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ productId: `p_${i}`, addedAt: i }));
    $wishlist.set(items);
    const { result } = renderHook(() => useWishlist());
    act(() => result.current.add('p_overflow'));
    expect(result.current.count).toBe(200);
    expect(result.current.isInWishlist('p_overflow')).toBe(false);
  });
});
