import { $wishlist, $wishlistSyncStatus, mergeIntoWishlist } from './store';
import { wishlistApi } from './api';

const DEBOUNCE_MS = 500;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;

type Op = { type: 'add' | 'remove'; productId: string; attempt: number };
const queue: Op[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Test-only helper. */
export function _resetSync() {
  queue.length = 0;
  if (timer) { clearTimeout(timer); timer = null; }
}

function scheduleFlush(delayMs = DEBOUNCE_MS) {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    await flush();
  }, delayMs);
}

async function flush() {
  if (queue.length === 0) return;
  $wishlistSyncStatus.set('syncing');
  const op = queue[0];
  try {
    if (op.type === 'add') await wishlistApi.add(op.productId);
    else await wishlistApi.remove(op.productId);
    queue.shift();
    $wishlistSyncStatus.set(queue.length > 0 ? 'syncing' : 'idle');
    if (queue.length > 0) scheduleFlush(DEBOUNCE_MS);
  } catch {
    op.attempt += 1;
    $wishlistSyncStatus.set('error');
    const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (op.attempt - 1), BACKOFF_MAX_MS);
    scheduleFlush(backoff);
  }
}

export function queueAdd(productId: string)    { queue.push({ type: 'add',    productId, attempt: 0 }); scheduleFlush(); }
export function queueRemove(productId: string) { queue.push({ type: 'remove', productId, attempt: 0 }); scheduleFlush(); }

/** Called once when a customer logs in. */
export async function syncOnLogin(): Promise<void> {
  $wishlistSyncStatus.set('syncing');
  try {
    const server = await wishlistApi.list();
    mergeIntoWishlist(server);
    const merged = $wishlist.get();
    const result = await wishlistApi.replace(merged);
    // server is authoritative after replace
    $wishlist.set(result);
    $wishlistSyncStatus.set('idle');
  } catch {
    $wishlistSyncStatus.set('error');
  }
}
