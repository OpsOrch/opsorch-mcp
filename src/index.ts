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

const logFilterSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.string(),
});

const logExpressionSchema = z.object({
  search: z.string().optional(),
  filters: z.array(logFilterSchema).optional(),
  severityIn: z.array(z.string()).optional(),
});

const logQuerySchema = z.object({
  expression: logExpressionSchema.optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  scope: queryScopeSchema.optional(),
  limit: z.number().int().positive().optional(),
  metadata: z.record(z.any()).optional(),
  providers: z.array(z.string()).optional(),
});

const metricFilterSchema = z.object({
  label: z.string(),
  operator: z.string(),
  value: z.string(),
});

const metricExpressionSchema = z.object({
  metricName: z.string(),
  aggregation: z.string().optional(),
  filters: z.array(metricFilterSchema).optional(),
  groupBy: z.array(z.string()).optional(),
});

const metricQuerySchema = z.object({
  expression: metricExpressionSchema.optional(),
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

const capabilitySchema = z.enum(['incident', 'log', 'metric', 'ticket', 'service']);

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

  server.registerTool(
    'describe-metrics',
    {
      title: 'Describe Metrics',
      description: 'List available metrics with POST /metrics/describe to discover what metrics are exposed by the provider.',
      inputSchema: z.object({
        scope: queryScopeSchema.optional(),
      }),
      outputSchema: z.any(),
    },
    async (input) => {
      const payload = input.scope || {};
      const data = await coreRequest('/metrics/describe', 'POST', payload);
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
