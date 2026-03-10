import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '../../lib/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does NOT update value before delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'initial', delay: 300 } },
    );

    // Change the value
    rerender({ value: 'updated', delay: 300 });

    // Advance time but NOT enough
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should still be the old value
    expect(result.current).toBe('initial');
  });

  it('updates value after delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'initial', delay: 300 } },
    );

    // Change the value
    rerender({ value: 'updated', delay: 300 });

    // Advance time past the delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should now be updated
    expect(result.current).toBe('updated');
  });

  it('resets timer on rapid value changes (only last value is used)', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'v1', delay: 300 } },
    );

    // Change rapidly
    rerender({ value: 'v2', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'v3', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'v4', delay: 300 });

    // At this point none of the intermediate values should have fired
    expect(result.current).toBe('v1');

    // Advance past the delay from last change
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Only the final value should be set
    expect(result.current).toBe('v4');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 0, delay: 500 } },
    );

    rerender({ value: 42, delay: 500 });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe(42);
  });
});
