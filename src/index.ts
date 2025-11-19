import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express from 'express';
import { logger } from './logger';

const pkgVersion = '1.0.0';

function getCoreURL(): string {
  return process.env.OPSORCH_CORE_URL || 'http://localhost:8080';
}

function getCoreToken(): string {
  // Default demo token so Core enforces bearer auth even when env is unset.
  return process.env.OPSORCH_CORE_TOKEN || 'demo';
}

function getCoreTimeoutMs(): number {
  return Number.parseInt(process.env.OPSORCH_CORE_TIMEOUT_MS || '15000', 10);
}

const queryScopeSchema = z.object({
  service: z.string().optional(),
  team: z.string().optional(),
  environment: z.string().optional(),
});

const incidentQuerySchema = z.object({
  query: z.string().optional(),
  statuses: z.array(z.string()).optional(),
  severities: z.array(z.string()).optional(),
  scope: queryScopeSchema.optional(),
  limit: z.number().int().positive().optional(),
  metadata: z.record(z.any()).optional(),
});

const createIncidentSchema = z.object({
  title: z.string(),
  status: z.string(),
  severity: z.string(),
  service: z.string().optional(),
  fields: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateIncidentSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  service: z.string().optional(),
  fields: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const timelineAppendSchema = z.object({
  id: z.string(),
  at: z.string().datetime().optional(),
  kind: z.string(),
  body: z.string(),
  actor: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const logQuerySchema = z.object({
  query: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  scope: queryScopeSchema.optional(),
  limit: z.number().int().positive().optional(),
  metadata: z.record(z.any()).optional(),
  providers: z.array(z.string()).optional(),
});

const metricQuerySchema = z.object({
  expression: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  step: z.number().int().positive(),
  scope: queryScopeSchema.optional(),
  metadata: z.record(z.any()).optional(),
});

const serviceQuerySchema = z.object({
  ids: z.array(z.string()).optional(),
  name: z.string().optional(),
  tags: z.record(z.string()).optional(),
  limit: z.number().int().positive().optional(),
  scope: queryScopeSchema.optional(),
  metadata: z.record(z.any()).optional(),
});

const ticketQuerySchema = z.object({
  query: z.string().optional(),
  statuses: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  reporter: z.string().optional(),
  scope: queryScopeSchema.optional(),
  limit: z.number().int().positive().optional(),
  metadata: z.record(z.any()).optional(),
});

const createTicketSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  fields: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateTicketSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  fields: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const messageSchema = z.object({
  channel: z.string(),
  body: z.string(),
  metadata: z.record(z.any()).optional(),
  threadRef: z.string().optional(),
});

const capabilitySchema = z.enum(['incident', 'log', 'metric', 'ticket', 'messaging', 'service']);

export function buildURL(pathname: string): string {
  const base = new URL(getCoreURL());
  base.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return base.toString();
}

export async function coreRequest<T>(
  pathname: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getCoreTimeoutMs());
  const startedAt = Date.now();
  let failureLogged = false;

  logger.debug('Calling OpsOrch Core', {
    method,
    pathname,
    body,
  });

  try {
    const res = await fetch(buildURL(pathname), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getCoreToken() ? { Authorization: `Bearer ${getCoreToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : null,
      signal: controller.signal,
    });

    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      const message = typeof data === 'object' && data !== null && 'message' in data ? String((data as any).message) : res.statusText;
      failureLogged = true;
      logger.error('OpsOrch Core call failed', {
        method,
        pathname,
        status: res.status,
        durationMs,
        error: message,
      });
      throw new Error(`OpsOrch Core ${res.status}: ${message}`);
    }

    logger.info('OpsOrch Core call succeeded', {
      method,
      pathname,
      status: res.status,
      durationMs,
    });
    logger.debug('OpsOrch Core response payload', {
      method,
      pathname,
      response: data,
    });
    return data as T;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (!failureLogged) {
      logger.error('OpsOrch Core request encountered an error', {
        method,
        pathname,
        durationMs,
        error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function asContent(value: unknown): { content: { type: 'text'; text: string }[]; structuredContent: any } {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value,
  };
}

function buildServer(): McpServer {
  const server = new McpServer({
    name: 'opsorch-mcp',
    version: pkgVersion,
  });

  // Health check
  server.registerTool(
    'health',
    {
      title: 'OpsOrch Core Health',
      description: 'Ping GET /health to confirm the configured OpsOrch Core is reachable and authenticated before taking action.',
      inputSchema: z.object({}),
      outputSchema: z.any(),
    },
    async () => {
      const data = await coreRequest<Record<string, unknown>>('/health', 'GET');
      return asContent(data);
    }
  );

  // Incidents
  server.registerTool(
    'query-incidents',
    {
      title: 'Query Incidents',
      description: 'Search incidents via POST /incidents/query using scope, status, or metadata filters when you need a targeted list to inspect.',
      inputSchema: incidentQuerySchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = incidentQuerySchema.parse(input);
      const data = await coreRequest('/incidents/query', 'POST', payload);
      return asContent(data);
    }
  );

  server.registerTool(
    'list-incidents',
    {
      title: 'List Incidents',
      description: 'Quickly enumerate the latest incidents with GET /incidents when you just need the provider’s default listing.',
      inputSchema: z.object({}),
      outputSchema: z.any(),
    },
    async () => {
      const data = await coreRequest('/incidents', 'GET');
      return asContent(data);
    }
  );

  server.registerTool(
    'create-incident',
    {
      title: 'Create Incident',
      description: 'Open a canonical incident via POST /incidents after confirming a new record is justified and scoped.',
      inputSchema: createIncidentSchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = createIncidentSchema.parse(input);
      const data = await coreRequest('/incidents', 'POST', payload);
      return asContent(data);
    }
  );

  server.registerTool(
    'get-incident',
    {
      title: 'Get Incident',
      description: 'Retrieve the full incident payload with GET /incidents/{id} before updating or appending evidence.',
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.any(),
    },
    async ({ id }) => {
      const data = await coreRequest(`/incidents/${encodeURIComponent(id)}`, 'GET');
      return asContent(data);
    }
  );

  server.registerTool(
    'update-incident',
    {
      title: 'Update Incident',
      description: 'Adjust status, severity, or fields via PATCH /incidents/{id} once you have the incident’s latest state.',
      inputSchema: z.object({ id: z.string() }).merge(updateIncidentSchema),
      outputSchema: z.any(),
    },
    async (input) => {
      const { id, ...rest } = input;
      const payload = updateIncidentSchema.parse(rest);
      const data = await coreRequest(`/incidents/${encodeURIComponent(id)}`, 'PATCH', payload);
      return asContent(data);
    }
  );

  server.registerTool(
    'get-incident-timeline',
    {
      title: 'Get Incident Timeline',
      description: 'Read the chronological audit trail for an incident through GET /incidents/{id}/timeline.',
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.any(),
    },
    async ({ id }) => {
      const data = await coreRequest(`/incidents/${encodeURIComponent(id)}/timeline`, 'GET');
      return asContent(data);
    }
  );

  server.registerTool(
    'append-incident-timeline',
    {
      title: 'Append Incident Timeline',
      description: 'Append evidence or status notes via POST /incidents/{id}/timeline, including correlation IDs in metadata.',
      inputSchema: timelineAppendSchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = timelineAppendSchema.parse(input);
      const at = payload.at || new Date().toISOString();
      const { id, ...rest } = payload;
      const data = await coreRequest(`/incidents/${encodeURIComponent(id)}/timeline`, 'POST', {
        ...rest,
        at,
      });
      return asContent(data);
    }
  );

  // Logs
  server.registerTool(
    'query-logs',
    {
      title: 'Query Logs',
      description: 'Pull scoped telemetry through POST /logs/query to gather evidence or validate hypotheses before mutating state.',
      inputSchema: logQuerySchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = logQuerySchema.parse(input);
      const data = await coreRequest('/logs/query', 'POST', payload);
      return asContent(data);
    }
  );

  // Metrics
  server.registerTool(
    'query-metrics',
    {
      title: 'Query Metrics',
      description: 'Fetch normalized metric time series with POST /metrics/query to confirm trends or mitigation impact.',
      inputSchema: metricQuerySchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = metricQuerySchema.parse(input);
      const data = await coreRequest('/metrics/query', 'POST', payload);
      return asContent(data);
    }
  );

  // Tickets
  server.registerTool(
    'query-tickets',
    {
      title: 'Query Tickets',
      description: 'Search the ticket provider via POST /tickets/query when you need downstream work items tied to an incident.',
      inputSchema: ticketQuerySchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = ticketQuerySchema.parse(input);
      const data = await coreRequest('/tickets/query', 'POST', payload);
      return asContent(data);
    }
  );

  server.registerTool(
    'create-ticket',
    {
      title: 'Create Ticket',
      description: 'Create a follow-up or project-management ticket through POST /tickets once human approval is obtained.',
      inputSchema: createTicketSchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = createTicketSchema.parse(input);
      const data = await coreRequest('/tickets', 'POST', payload);
      return asContent(data);
    }
  );

  server.registerTool(
    'get-ticket',
    {
      title: 'Get Ticket',
      description: 'Retrieve the authoritative ticket record with GET /tickets/{id} prior to updates or messaging.',
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.any(),
    },
    async ({ id }) => {
      const data = await coreRequest(`/tickets/${encodeURIComponent(id)}`, 'GET');
      return asContent(data);
    }
  );

  server.registerTool(
    'update-ticket',
    {
      title: 'Update Ticket',
      description: 'Adjust ticket status, ownership, or metadata via PATCH /tickets/{id} after syncing with stakeholders.',
      inputSchema: z.object({ id: z.string() }).merge(updateTicketSchema),
      outputSchema: z.any(),
    },
    async (input) => {
      const { id, ...rest } = input;
      const payload = updateTicketSchema.parse(rest);
      const data = await coreRequest(`/tickets/${encodeURIComponent(id)}`, 'PATCH', payload);
      return asContent(data);
    }
  );

  // Services
  server.registerTool(
    'list-services',
    {
      title: 'List Services',
      description: 'Enumerate known services through GET /services to discover IDs or tags for scoping follow-up calls.',
      inputSchema: z.object({}),
      outputSchema: z.any(),
    },
    async () => {
      const data = await coreRequest('/services', 'GET');
      return asContent(data);
    }
  );

  server.registerTool(
    'query-services',
    {
      title: 'Query Services',
      description: 'Look up service metadata by name, ID, or tags via POST /services/query to find owners or environments.',
      inputSchema: serviceQuerySchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = serviceQuerySchema.parse(input);
      const data = await coreRequest('/services/query', 'POST', payload);
      return asContent(data);
    }
  );

  // Messaging
  server.registerTool(
    'send-message',
    {
      title: 'Send Message',
      description: 'Broadcast an update to a channel or thread via POST /messages/send so humans stay in the loop.',
      inputSchema: messageSchema,
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = messageSchema.parse(input);
      const data = await coreRequest('/messages/send', 'POST', payload);
      return asContent(data);
    }
  );

  // Providers
  server.registerTool(
    'list-providers',
    {
      title: 'List Capability Providers',
      description: 'Inspect which back-end connectors are available for a capability via GET /providers/{capability}.',
      inputSchema: z.object({ capability: capabilitySchema }),
      outputSchema: z.any(),
    },
    async ({ capability }) => {
      const data = await coreRequest(`/providers/${encodeURIComponent(capability)}`, 'GET');
      return asContent(data);
    }
  );

  // Expose the Agents Architecture doc as a resource for retrieval.
  const agentsDocPath = path.resolve(__dirname, '..', 'AGENTS.md');
  server.registerResource(
    'opsorch-agents-doc',
    'opsorch://docs/agents-architecture',
    {
      title: 'OpsOrch Agents Architecture',
      description: 'Authoritative note on agent roles and responsibilities.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const text = await readFile(agentsDocPath, 'utf8');
      return {
        contents: [
          {
            uri: uri.href,
            text,
          },
        ],
      };
    }
  );

  return server;
}

async function main() {
  // stdio transport (default for CLI-spawned MCP clients)
  const stdioTransport = new StdioServerTransport();
  const stdioServer = buildServer();
  await stdioServer.connect(stdioTransport);
  logger.info('OpsOrch MCP stdio transport ready');

  // Optional HTTP transport for clients that prefer HTTP MCP.
  const httpPort = process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : 7070;
  if (!Number.isNaN(httpPort) && httpPort > 0) {
    const allowOrigins = process.env.MCP_HTTP_ALLOW_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
    const allowHosts = process.env.MCP_HTTP_ALLOW_HOSTS?.split(',').map((s) => s.trim()).filter(Boolean);
    const app = express();
    app.use(express.json());

    app.post('/mcp', async (req, res) => {
      // Per-request server instance to avoid initialization conflicts when clients send isolated requests.
      const httpServer = buildServer();
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
        allowedOrigins: allowOrigins ?? [],
        allowedHosts: allowHosts ?? [],
      });

      res.on('close', () => {
        transport.close();
      });

      await httpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.listen(httpPort, () => {
      logger.info('OpsOrch MCP HTTP listening', {
        url: `http://localhost:${httpPort}/mcp`,
        port: httpPort,
        allowOrigins,
        allowHosts,
      });
    });
  }
}

const shouldRun = process.env.MCP_SKIP_RUN !== '1' && process.env.NODE_ENV !== 'test';

if (shouldRun) {
  main().catch((error) => {
    logger.error('Failed to start opsorch-mcp server', { error });
    process.exit(1);
  });
}
