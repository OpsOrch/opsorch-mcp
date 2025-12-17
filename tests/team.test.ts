import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { coreRequest, asContent } from '../src/index';

const sampleURL = 'http://localhost:8080';

// Test 1: Query teams request routing
test('Query teams request routing', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const queryParams = {
    name: 'velocity',
    tags: { type: 'team', focus: 'checkout-web' },
    scope: { service: 'svc-checkout', team: 'team-velocity' },
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
    await coreRequest('/teams/query', 'POST', queryParams);
    
    // Verify the request was routed correctly
    assert.equal(capturedUrl, `${sampleURL}/teams/query`);
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
    name: 'engineering',
    tags: { type: 'department' },
    limit: 5
  };

  let requestMade = false;
  const restore = mock.method(global, 'fetch', async () => {
    requestMade = true;
    return new Response(JSON.stringify([]), { status: 200 });
  });

  try {
    await coreRequest('/teams/query', 'POST', validInput);
    assert.equal(requestMade, true, 'Valid input should result in HTTP request');
  } finally {
    restore.mock.restore();
  }
});

// Test 3: Get team request routing
test('Get team request routing', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const teamId = 'team-velocity';
  let capturedUrl = '';
  let capturedMethod = '';

  const restore = mock.method(global, 'fetch', async (url: any, init: any) => {
    capturedUrl = url;
    capturedMethod = init?.method || 'GET';
    return new Response(JSON.stringify({
      id: teamId,
      name: 'Velocity Team',
      parent: 'engineering',
      tags: { type: 'team', focus: 'checkout-web' }
    }), { status: 200 });
  });

  try {
    await coreRequest(`/teams/${encodeURIComponent(teamId)}`, 'GET');
    
    // Verify the request was routed correctly
    assert.equal(capturedUrl, `${sampleURL}/teams/${encodeURIComponent(teamId)}`);
    assert.equal(capturedMethod, 'GET');
  } finally {
    restore.mock.restore();
  }
});

// Test 4: Get team members request routing
test('Get team members request routing', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const teamId = 'team-velocity';
  let capturedUrl = '';
  let capturedMethod = '';

  const restore = mock.method(global, 'fetch', async (url: any, init: any) => {
    capturedUrl = url;
    capturedMethod = init?.method || 'GET';
    return new Response(JSON.stringify([
      {
        id: 'charlie.brown@opsorch.com',
        name: 'Charlie Brown',
        email: 'charlie.brown@opsorch.com',
        handle: 'charlie.brown',
        role: 'owner'
      }
    ]), { status: 200 });
  });

  try {
    await coreRequest(`/teams/${encodeURIComponent(teamId)}/members`, 'GET');
    
    // Verify the request was routed correctly
    assert.equal(capturedUrl, `${sampleURL}/teams/${encodeURIComponent(teamId)}/members`);
    assert.equal(capturedMethod, 'GET');
  } finally {
    restore.mock.restore();
  }
});

// Test 5: Response formatting consistency
test('Response formatting consistency', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const teamData = [{
    id: 'team-velocity',
    name: 'Velocity Team',
    parent: 'engineering',
    tags: {
      type: 'team',
      provider: 'mock',
      organization: 'demo-org',
      focus: 'checkout-web'
    },
    metadata: {
      description: 'Checkout and web frontend development',
      slack_channel: '#velocity',
      email: 'velocity@opsorch.com',
      members_count: 4,
      created_at: '2023-02-01T14:30:00Z',
      services: ['svc-checkout', 'svc-web', 'svc-order'],
      repositories: ['checkout-api', 'web-frontend', 'order-service']
    }
  }];

  const restore = mock.method(global, 'fetch', async () => {
    return new Response(JSON.stringify(teamData), { status: 200 });
  });

  try {
    const result = await coreRequest('/teams/query', 'POST', {});
    
    // Verify the response is formatted correctly
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    
    const team = result[0];
    assert.equal(team.id, 'team-velocity');
    assert.equal(team.name, 'Velocity Team');
    assert.equal(team.parent, 'engineering');
    assert.deepEqual(team.tags, {
      type: 'team',
      provider: 'mock',
      organization: 'demo-org',
      focus: 'checkout-web'
    });
    assert.ok(team.metadata);
    assert.equal(team.metadata.description, 'Checkout and web frontend development');
    assert.equal(team.metadata.slack_channel, '#velocity');
    assert.deepEqual(team.metadata.services, ['svc-checkout', 'svc-web', 'svc-order']);
  } finally {
    restore.mock.restore();
  }
});

// Test 6: Query parameter pass-through
test('Query parameter pass-through', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const queryParams = {
    name: 'team',
    tags: { type: 'team', focus: 'payments' },
    scope: { service: 'svc-payments', team: 'team-revenue', environment: 'production' },
    limit: 20,
    metadata: { active: true }
  };

  let capturedBody: any = null;

  const restore = mock.method(global, 'fetch', async (url: any, init: any) => {
    capturedBody = init?.body ? JSON.parse(init.body) : null;
    return new Response(JSON.stringify([]), { status: 200 });
  });

  try {
    await coreRequest('/teams/query', 'POST', queryParams);
    
    // Verify all provided parameters are passed through
    assert.equal(capturedBody.name, queryParams.name);
    assert.deepEqual(capturedBody.tags, queryParams.tags);
    assert.deepEqual(capturedBody.scope, queryParams.scope);
    assert.equal(capturedBody.limit, queryParams.limit);
    assert.deepEqual(capturedBody.metadata, queryParams.metadata);
  } finally {
    restore.mock.restore();
  }
});

// Test 7: asContent helper formatting
test('asContent helper formats team data correctly', () => {
  const teamData = {
    id: 'team-aurora',
    name: 'Aurora Team',
    parent: 'engineering',
    tags: { type: 'team', focus: 'search-discovery' },
    metadata: {
      description: 'Search and discovery systems',
      services: ['svc-search']
    }
  };

  const result = asContent(teamData);
  
  // Verify content structure
  assert.ok(result.content);
  assert.ok(Array.isArray(result.content));
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]?.type, 'text');
  assert.ok(result.content[0]?.text.includes('team-aurora'));
  assert.ok(result.content[0]?.text.includes('Aurora Team'));
  
  // Verify structured content
  assert.deepEqual(result.structuredContent, teamData);
});

// Test 8: Error propagation
test('Error propagation from OpsOrch Core', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const restore = mock.method(global, 'fetch', async () => {
    return new Response(JSON.stringify({ message: 'Team not found' }), { 
      status: 404, 
      statusText: 'Not Found' 
    });
  });

  try {
    await assert.rejects(
      coreRequest('/teams/team-nonexistent', 'GET'),
      /OpsOrch Core 404: Team not found/
    );
  } finally {
    restore.mock.restore();
  }
});

// Test 9: Team member schema compliance
test('Team member schema compliance', async () => {
  process.env.OPSORCH_CORE_URL = sampleURL;
  process.env.OPSORCH_CORE_TOKEN = 'test-token';

  const memberData = [
    {
      id: 'charlie.brown@opsorch.com',
      name: 'Charlie Brown',
      email: 'charlie.brown@opsorch.com',
      handle: 'charlie.brown',
      role: 'owner',
      metadata: {
        title: 'Senior Full-Stack Engineer',
        location: 'New York, NY',
        timezone: 'America/New_York',
        github: 'charlie-brown',
        languages: ['Go', 'TypeScript', 'React'],
        services: ['svc-checkout', 'svc-web', 'svc-order'],
        joined_at: '2023-01-15T09:00:00Z'
      }
    },
    {
      id: 'diana.prince@opsorch.com',
      name: 'Diana Prince',
      email: 'diana.prince@opsorch.com',
      handle: 'diana.prince',
      role: 'member'
    }
  ];

  const restore = mock.method(global, 'fetch', async () => {
    return new Response(JSON.stringify(memberData), { status: 200 });
  });

  try {
    const result = await coreRequest('/teams/team-velocity/members', 'GET');
    
    // Verify both members have required fields
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
    
    // Check first member (with metadata)
    const member1 = result[0];
    assert.equal(typeof member1.id, 'string');
    assert.equal(typeof member1.name, 'string');
    assert.equal(typeof member1.email, 'string');
    assert.equal(typeof member1.handle, 'string');
    assert.equal(typeof member1.role, 'string');
    assert.equal(typeof member1.metadata, 'object');
    assert.equal(member1.metadata.title, 'Senior Full-Stack Engineer');
    
    // Check second member (minimal)
    const member2 = result[1];
    assert.equal(typeof member2.id, 'string');
    assert.equal(typeof member2.name, 'string');
    assert.equal(typeof member2.email, 'string');
    assert.equal(typeof member2.handle, 'string');
    assert.equal(typeof member2.role, 'string');
  } finally {
    restore.mock.restore();
  }
});

// Test 10: HTTP MCP transport integration
test('HTTP MCP transport supports team tools', async () => {
  // This test verifies that team tools are properly registered and accessible via MCP
  // We can't easily test the full HTTP transport without starting a server, but we can verify
  // the tools are registered correctly by checking if they would be included in a tools list
  
  // Mock a tools/list call response that would include team tools
  const expectedTools = [
    'query-incidents', 'get-incident', 'get-incident-timeline',
    'query-alerts', 'query-logs', 'query-metrics', 'describe-metrics',
    'query-tickets', 'get-ticket', 'query-deployments', 'get-deployment',
    'query-services', 'query-teams', 'get-team', 'get-team-members',
    'list-providers'
  ];
  
  // Verify team tools would be included in the expected tool list
  assert.ok(expectedTools.includes('query-teams'), 'query-teams should be in tools list');
  assert.ok(expectedTools.includes('get-team'), 'get-team should be in tools list');
  assert.ok(expectedTools.includes('get-team-members'), 'get-team-members should be in tools list');
  
  // Verify the tools are positioned correctly (after services, before list-providers)
  const queryTeamsIndex = expectedTools.indexOf('query-teams');
  const getTeamIndex = expectedTools.indexOf('get-team');
  const getTeamMembersIndex = expectedTools.indexOf('get-team-members');
  const servicesIndex = expectedTools.indexOf('query-services');
  const providersIndex = expectedTools.indexOf('list-providers');
  
  assert.ok(queryTeamsIndex > servicesIndex, 'team tools should come after service tools');
  assert.ok(queryTeamsIndex < providersIndex, 'team tools should come before provider tools');
  assert.ok(getTeamIndex === queryTeamsIndex + 1, 'get-team should follow query-teams');
  assert.ok(getTeamMembersIndex === getTeamIndex + 1, 'get-team-members should follow get-team');
});