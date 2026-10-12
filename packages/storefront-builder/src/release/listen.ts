import type { PoolClient } from 'pg';
import { errorText } from '../errors';
import type { Log } from '../log';
import type { Database } from '../shop-state';
import { RELEASE_CHANNEL } from './store';

// Ведущий волн просыпается от NOTIFY storefront_release (команда выпуска, approve, revert-all — задача 10). Соединение
// LISTEN — своё, отдельно от пула запросов. Оборвалось — через RELISTEN_MS подписка снова (таймер только на сбое);
// подписались заново — ведущий сверяет выпуски: NOTIFY, пришедший без подписки, потерян.
const RELISTEN_MS = 5_000;

interface Listener {
  db: Database;
  wake: () => void;
  log: Log;
  client: PoolClient | null;
  stopped: boolean;
}

async function subscribe(listener: Listener): Promise<void> {
  const fresh = await listener.db.connect();
  try {
    fresh.on('notification', (message) => (message.channel === RELEASE_CHANNEL ? listener.wake() : undefined));
    fresh.on('error', (error) => lost(listener, fresh, error));
    await fresh.query(`LISTEN ${RELEASE_CHANNEL}`);
    listener.client = fresh;
  } catch (error) {
    fresh.release(true);
    throw error;
  }
}

function retry(listener: Listener): void {
  if (listener.stopped) return;
  setTimeout(() => {
    subscribe(listener).then(listener.wake, (error: unknown) => {
      listener.log('release-listen-failed', { error: errorText(error) });
      retry(listener);
    });
  }, RELISTEN_MS);
}

function lost(listener: Listener, broken: PoolClient, error: unknown): void {
  listener.log('release-listen-failed', { error: errorText(error) });
  broken.release(true);
  listener.client = null;
  retry(listener);
}

export async function listenReleases(db: Database, wake: () => void, log: Log): Promise<() => Promise<void>> {
  const listener: Listener = { db, wake, log, client: null, stopped: false };
  await subscribe(listener);
  return async () => {
    listener.stopped = true;
    await listener.client?.query(`UNLISTEN ${RELEASE_CHANNEL}`);
    listener.client?.release();
  };
}
