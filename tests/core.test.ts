import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { asContent, buildURL, coreRequest } from '../src/index';

const sampleURL = 'http://localhost:8080';

// Ensure helper builds URLs relative to base.
test('buildURL normalizes leading slash', () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  assert.equal(buildURL('health'), `${sampleURL}/health`);
  assert.equal(buildURL('/health'), `${sampleURL}/health`);
});

test('asContent wraps strings and objects', () => {
  const str = asContent('ok');
  assert.ok(str.content[0]);
  assert.equal(str.content[0]!.text, 'ok');
  assert.equal(str.structuredContent, 'ok');

  const obj = asContent({ a: 1 });
  assert.ok(obj.content[0]);
  assert.equal(obj.content[0]!.text.includes('"a": 1'), true);
  assert.deepEqual(obj.structuredContent, { a: 1 });
});

test('coreRequest forwards headers/body and parses JSON', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'token123';
  const restore = mock.method(global, 'fetch', async (url: any, init: any) => {
    assert.equal(url, `${sampleURL}/health`);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.headers && (init.headers as Record<string, string>)['Content-Type'], 'application/json');
    assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, 'Bearer token123');
    assert.equal(init?.body, null);
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  });

  try {
    const res = await coreRequest<{ status: string }>('/health', 'GET');
    assert.deepEqual(res, { status: 'ok' });
  } finally {
    restore.mock.restore();
  }
});

test('coreRequest surfaces HTTP errors with body message', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  const restore = mock.method(global, 'fetch', async () => {
    return new Response(JSON.stringify({ message: 'bad' }), { status: 500, statusText: 'Internal' });
  });

  try {
    await assert.rejects(coreRequest('/health', 'GET'), /OpsOrch Core 500: bad/);
  } finally {
    restore.mock.restore();
  }
});
