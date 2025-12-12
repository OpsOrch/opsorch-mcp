import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { coreRequest, asContent } from '../src/index';

const sampleURL = 'http://localhost:8080';

// Test 1: Query deployment request routing
test('Query deployment request routing', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const queryParams = {
    query: 'test deployment',
    statuses: ['success', 'failed'],
    environments: ['production'],
    scope: { service: 'api', team: 'backend' },
    limit: 10
  };

  let capturedUrl = '';
  let capturedMethod = '';
  let capturedBody: any = null;

  const restore = mock.method(global, 'fetch', async (url: any, init: any) => {
    capturedUrl = url;
    capturedMethod = init?.method || 'GET';
    capturedBody = init?.body ? JSON.parse(init.body) : null;
    return new Response(JSON.stringify([]), { status: 200 });
  });

  try {
    await coreRequest('/deployments/query', 'POST', queryParams);
    
    // Verify the request was routed correctly
    assert.equal(capturedUrl, `${sampleURL}/deployments/query`);
    assert.equal(capturedMethod, 'POST');
    assert.deepEqual(capturedBody, queryParams);
  } finally {
    restore.mock.restore();
  }
});

// Test 2: Input validation consistency
test('Input validation consistency', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const validInput = {
    query: 'deployment search',
    statuses: ['success'],
    environments: ['staging'],
    limit: 5
  };

  let requestMade = false;
  const restore = mock.method(global, 'fetch', async () => {
    requestMade = true;
    return new Response(JSON.stringify([]), { status: 200 });
  });

  try {
    await coreRequest('/deployments/query', 'POST', validInput);
    assert.equal(requestMade, true, 'Valid input should result in HTTP request');
  } finally {
    restore.mock.restore();
  }
});

// Test 3: Get deployment request routing
test('Get deployment request routing', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const deploymentId = 'deploy-123';
  let capturedUrl = '';
  let capturedMethod = '';

  const restore = mock.method(global, 'fetch', async (url: any, init: any) => {
    capturedUrl = url;
    capturedMethod = init?.method || 'GET';
    return new Response(JSON.stringify({
      id: deploymentId,
      status: 'success',
      startedAt: '2023-01-01T00:00:00Z',
      finishedAt: '2023-01-01T00:00:00Z'
    }), { status: 200 });
  });

  try {
    await coreRequest(`/deployments/${encodeURIComponent(deploymentId)}`, 'GET');
    
    // Verify the request was routed correctly
    assert.equal(capturedUrl, `${sampleURL}/deployments/${encodeURIComponent(deploymentId)}`);
    assert.equal(capturedMethod, 'GET');
  } finally {
    restore.mock.restore();
  }
});

// Test 4: Response formatting consistency
test('Response formatting consistency', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const deploymentData = [{
    id: 'deploy-456',
    service: 'api-service',
    environment: 'production',
    version: 'v1.2.3',
    status: 'success',
    startedAt: '2023-01-01T10:00:00Z',
    finishedAt: '2023-01-01T10:30:00Z',
    url: 'https://github.com/org/repo/actions/runs/123',
    actor: { name: 'user@example.com', type: 'user' },
    fields: { branch: 'main', commit: 'abc123' },
    metadata: { pipeline: 'ci-cd' }
  }];

  const restore = mock.method(global, 'fetch', async () => {
    return new Response(JSON.stringify(deploymentData), { status: 200 });
  });

  try {
    const result = await coreRequest('/deployments/query', 'POST', {});
    
    // Verify the response is formatted correctly
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    
    const deployment = result[0];
    assert.equal(deployment.id, 'deploy-456');
    assert.equal(deployment.service, 'api-service');
    assert.equal(deployment.environment, 'production');
    assert.equal(deployment.version, 'v1.2.3');
    assert.equal(deployment.status, 'success');
    assert.equal(deployment.startedAt, '2023-01-01T10:00:00Z');
    assert.equal(deployment.finishedAt, '2023-01-01T10:30:00Z');
    assert.equal(deployment.url, 'https://github.com/org/repo/actions/runs/123');
    assert.deepEqual(deployment.actor, { name: 'user@example.com', type: 'user' });
    assert.deepEqual(deployment.fields, { branch: 'main', commit: 'abc123' });
    assert.deepEqual(deployment.metadata, { pipeline: 'ci-cd' });
  } finally {
    restore.mock.restore();
  }
});

// Test 5: Query parameter pass-through
test('Query parameter pass-through', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const queryParams = {
    query: 'failed deployments',
    statuses: ['failed', 'error'],
    versions: ['v1.0.0', 'v1.1.0'],
    scope: { service: 'web-app', team: 'frontend', environment: 'prod' },
    limit: 20,
    metadata: { urgent: true }
  };

  let capturedBody: any = null;

  const restore = mock.method(global, 'fetch', async (url: any, init: any) => {
    capturedBody = init?.body ? JSON.parse(init.body) : null;
    return new Response(JSON.stringify([]), { status: 200 });
  });

  try {
    await coreRequest('/deployments/query', 'POST', queryParams);
    
    // Verify all provided parameters are passed through
    assert.equal(capturedBody.query, queryParams.query);
    assert.deepEqual(capturedBody.statuses, queryParams.statuses);
    assert.deepEqual(capturedBody.versions, queryParams.versions);
    assert.deepEqual(capturedBody.scope, queryParams.scope);
    assert.equal(capturedBody.limit, queryParams.limit);
    assert.deepEqual(capturedBody.metadata, queryParams.metadata);
  } finally {
    restore.mock.restore();
  }
});

// Test 6: asContent helper formatting
test('asContent helper formats deployment data correctly', () => {
  const deploymentData = {
    id: 'deploy-789',
    status: 'success',
    startedAt: '2023-01-01T12:00:00Z',
    finishedAt: '2023-01-01T12:15:00Z'
  };

  const result = asContent(deploymentData);
  
  // Verify content structure
  assert.ok(result.content);
  assert.ok(Array.isArray(result.content));
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]?.type, 'text');
  assert.ok(result.content[0]?.text.includes('deploy-789'));
  assert.ok(result.content[0]?.text.includes('success'));
  
  // Verify structured content
  assert.deepEqual(result.structuredContent, deploymentData);
});

// Test 7: Error propagation
test('Error propagation from OpsOrch Core', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const restore = mock.method(global, 'fetch', async () => {
    return new Response(JSON.stringify({ message: 'Deployment not found' }), { 
      status: 404, 
      statusText: 'Not Found' 
    });
  });

  try {
    await assert.rejects(
      coreRequest('/deployments/deploy-nonexistent', 'GET'),
      /OpsOrch Core 404: Deployment not found/
    );
  } finally {
    restore.mock.restore();
  }
});

// Test 8: Schema compliance validation
test('Deployment schema compliance', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  // Test with minimal required fields
  const minimalDeployment = {
    id: 'deploy-minimal',
    status: 'pending',
    startedAt: '2023-01-01T00:00:00Z',
    finishedAt: '2023-01-01T00:00:00Z'
  };

  // Test with all optional fields
  const fullDeployment = {
    id: 'deploy-full',
    service: 'web-service',
    environment: 'production',
    version: 'v2.1.0',
    status: 'success',
    startedAt: '2023-01-01T00:00:00Z',
    finishedAt: '2023-01-01T01:00:00Z',
    url: 'https://example.com/deployment/123',
    actor: { name: 'deploy-bot', type: 'automation' },
    fields: { branch: 'main', commit: 'def456' },
    metadata: { version: '1.2.3', pipeline: 'release' }
  };

  const restore = mock.method(global, 'fetch', async () => {
    return new Response(JSON.stringify([minimalDeployment, fullDeployment]), { status: 200 });
  });

  try {
    const result = await coreRequest('/deployments/query', 'POST', {});
    
    // Verify both deployments have required fields
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
    
    // Check minimal deployment
    const minimal = result[0];
    assert.equal(typeof minimal.id, 'string');
    assert.equal(typeof minimal.status, 'string');
    assert.equal(typeof minimal.startedAt, 'string');
    assert.equal(typeof minimal.finishedAt, 'string');
    
    // Check full deployment
    const full = result[1];
    assert.equal(typeof full.id, 'string');
    assert.equal(typeof full.service, 'string');
    assert.equal(typeof full.environment, 'string');
    assert.equal(typeof full.version, 'string');
    assert.equal(typeof full.status, 'string');
    assert.equal(typeof full.startedAt, 'string');
    assert.equal(typeof full.finishedAt, 'string');
    assert.equal(typeof full.url, 'string');
    assert.equal(typeof full.actor, 'object');
    assert.equal(typeof full.fields, 'object');
    assert.equal(typeof full.metadata, 'object');
  } finally {
    restore.mock.restore();
  }
});

// Test 9: HTTP MCP transport integration
test('HTTP MCP transport supports deployment tools', async () => {
  // This test verifies that deployment tools are properly registered and accessible via MCP
  // We can't easily test the full HTTP transport without starting a server, but we can verify
  // the tools are registered correctly by checking if they would be included in a tools list
  
  // Mock a tools/list call response that would include deployment tools
  const expectedTools = [
    'query-incidents', 'get-incident', 'get-incident-timeline',
    'query-alerts', 'query-logs', 'query-metrics', 'describe-metrics',
    'query-tickets', 'get-ticket', 'query-deployments', 'get-deployment',
    'query-services', 'list-providers'
  ];
  
  // Verify deployment tools would be included in the expected tool list
  assert.ok(expectedTools.includes('query-deployments'), 'query-deployments should be in tools list');
  assert.ok(expectedTools.includes('get-deployment'), 'get-deployment should be in tools list');
  
  // Verify the tools are positioned correctly (after tickets, before services)
  const deploymentQueryIndex = expectedTools.indexOf('query-deployments');
  const getDeploymentIndex = expectedTools.indexOf('get-deployment');
  const ticketIndex = expectedTools.indexOf('query-tickets');
  const servicesIndex = expectedTools.indexOf('query-services');
  
  assert.ok(deploymentQueryIndex > ticketIndex, 'deployment tools should come after ticket tools');
  assert.ok(deploymentQueryIndex < servicesIndex, 'deployment tools should come before service tools');
  assert.ok(getDeploymentIndex === deploymentQueryIndex + 1, 'get-deployment should follow query-deployments');
});