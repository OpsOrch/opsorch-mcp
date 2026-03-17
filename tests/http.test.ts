import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildURL, classifyHttpRequest, hasHeaderAllowLists } from '../src/index';

test('buildURL preserves base path prefixes', () => {
  const previous = process.env.OPSORCH_CORE_URL;
  process.env.OPSORCH_CORE_URL = 'http://localhost:8080/api/v1';

  try {
    assert.equal(buildURL('/incidents/query'), 'http://localhost:8080/api/v1/incidents/query');
    assert.equal(buildURL('teams/query'), 'http://localhost:8080/api/v1/teams/query');
  } finally {
    if (previous === undefined) {
      delete process.env.OPSORCH_CORE_URL;
    } else {
      process.env.OPSORCH_CORE_URL = previous;
    }
  }
});

test('classifyHttpRequest treats initialize as session-creating', () => {
  assert.equal(
    classifyHttpRequest('POST', undefined, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    }),
    'initialize'
  );
});

test('classifyHttpRequest requires a session for GET and DELETE', () => {
  assert.equal(classifyHttpRequest('GET', undefined, undefined), 'session-required');
  assert.equal(classifyHttpRequest('DELETE', undefined, undefined), 'session-required');
});

test('classifyHttpRequest reuses existing sessions when a session id is present', () => {
  assert.equal(classifyHttpRequest('POST', 'session-123', { method: 'tools/list' }), 'session');
  assert.equal(classifyHttpRequest('GET', 'session-123', undefined), 'session');
});

test('classifyHttpRequest keeps isolated POST requests stateless', () => {
  assert.equal(classifyHttpRequest('POST', undefined, { method: 'tools/list' }), 'ephemeral');
});

test('hasHeaderAllowLists enables DNS rebinding protection only when configured', () => {
  assert.equal(hasHeaderAllowLists(undefined, undefined), false);
  assert.equal(hasHeaderAllowLists(['https://console.opsorch.dev'], undefined), true);
  assert.equal(hasHeaderAllowLists(undefined, ['opsorch.internal']), true);
});
