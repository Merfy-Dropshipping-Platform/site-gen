import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError } from '../src/errors';
import { replyValue } from '../src/rpc';

// Ответы сервисов по RabbitMQ (src/rpc.ts): у Nest — { err, response, isDisposed }, у сервиса на Go
// (analytics-collector, internal/rpc/rpc.go) — тело целиком.
describe('replyValue', () => {
  it('ответ Nest без ошибки — response', () => {
    const body = { err: null, response: { success: true, data: [] }, isDisposed: true, id: 'call-1' };
    expect(replyValue(body)).toEqual({ success: true, data: [] });
  });

  it('ответ Nest с ошибкой — rpc-failed', () => {
    expect(() => replyValue({ err: { message: 'Internal server error' }, isDisposed: true })).toThrow(
      StorefrontBuilderError,
    );
  });

  it('ответ сервиса на Go — тело целиком, и успех, и неуспех', () => {
    const ok = { success: true, data: { pixels: [] } };
    expect(replyValue(ok)).toEqual(ok);
    expect(replyValue({ success: false, error: 'unknown pattern: x' })).toEqual({
      success: false,
      error: 'unknown pattern: x',
    });
  });
});
