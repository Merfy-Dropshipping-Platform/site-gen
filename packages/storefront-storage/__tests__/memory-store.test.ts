import { createMemoryStore } from './memory-store';
import { describeStoreContract } from './store-contract';

describeStoreContract('память', () => ({ store: createMemoryStore(), prefix: 'test/' }));
