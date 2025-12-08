# opsorch-mcp

[![Version](https://img.shields.io/github/v/release/opsorch/opsorch-mcp)](https://github.com/opsorch/opsorch-mcp/releases)
[![License](https://img.shields.io/github/license/opsorch/opsorch-mcp)](https://github.com/opsorch/opsorch-mcp/blob/main/LICENSE)
[![CI](https://github.com/opsorch/opsorch-mcp/workflows/CI/badge.svg)](https://github.com/opsorch/opsorch-mcp/actions)

opsorch-mcp is the Model Context Protocol (MCP) server for OpsOrch. It exposes OpsOrch Core HTTP APIs as safe, read-only MCP tools for LLM and agent runtimes.

## Getting started

```
npm install
npm run dev    # runs via ts-node over stdio
# or
npm run build && npm start
```

The server uses stdio transport by default; spawn it from your MCP client (e.g., Claude Code, MCP Inspector, Cursor) pointing to the compiled `dist/index.js`.

Configure where to reach OpsOrch Core:

```
OPSORCH_CORE_URL=http://localhost:8080 \
OPSORCH_CORE_TOKEN=changeme            # Bearer token (default 'demo' if unset)
OPSORCH_CORE_TIMEOUT_MS=15000           # optional
OPSORCH_LOG_LEVEL=debug                 # optional (debug, info, warn, error)
MCP_HTTP_PORT=7070                      # optional HTTP transport (set 0 to disable)
MCP_HTTP_ALLOW_ORIGINS=https://app.local # optional CORS allow-list (comma-separated)
MCP_HTTP_ALLOW_HOSTS=app.local          # optional host header allow-list (comma-separated)
npm run dev
```

### Transports

The server always binds a stdio transport for MCP-native clients. By default it also exposes an HTTP endpoint on `http://localhost:7070/mcp` so you can run stateless JSON-RPC calls (see curl examples below). Set `MCP_HTTP_PORT=0` to skip HTTP entirely or change it to another positive integer to listen elsewhere. When serving remote clients, configure `MCP_HTTP_ALLOW_ORIGINS` (CORS) and `MCP_HTTP_ALLOW_HOSTS` (Host header allow-list) with comma-separated values.

### Quick HTTP MCP checks (curl)

HTTP transport here runs stateless: you can issue a single POST per call (no session or initialize required). Include the Accept header:

```
# list tools
curl -s http://localhost:7070/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# query incidents
curl -s http://localhost:7070/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query-incidents","arguments":{"query":"error","limit":5}}}'

# query tickets
curl -s http://localhost:7070/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"query-tickets","arguments":{"query":"outage","limit":5}}}'
```

## Tools (OpsOrch Core)

This server currently exposes **read-only** tools for querying and retrieving data. No mutation tools are available.

- `query-incidents` – POST /incidents/query
- `get-incident` – GET /incidents/{id}
- `get-incident-timeline` – GET /incidents/{id}/timeline
- `query-alerts` – POST /alerts/query
- `query-logs` – POST /logs/query
- `query-metrics` – POST /metrics/query
- `describe-metrics` – POST /metrics/describe
- `query-tickets` – POST /tickets/query
- `get-ticket` – GET /tickets/{id}
- `query-services` – POST /services/query
- `list-providers` – GET /providers/{capability}

### Logging

- `OPSORCH_LOG_LEVEL` controls verbosity (`debug`, `info`, `warn`, `error`).
- Every OpsOrch Core HTTP call logs method, path, duration, and status.
- `debug` adds request/response payloads so you can trace agent decisions end-to-end.

### Tool input field types

Documented below so agents can quickly see whether a field should be a string, integer, or structured payload and which ranges apply.

- **Query/list limits**: every `limit` argument is an optional positive integer (`> 0`). Keep requested rows lean (tens, not hundreds) unless a human explicitly approves a broader fetch.
- **Scope**: `scope.service`, `scope.team`, and `scope.environment` are optional strings that narrow every query and should always be set when known.
- **Incident queries (`query-incidents`)**: `query` is a free-text string; `statuses`/`severities` are string arrays; `metadata` is an object with provider-specific keys.
- **Alert queries (`query-alerts`)**: `query` is a free-text string; `statuses`/`severities` are string arrays.
- **Log queries (`query-logs`)**: `start`/`end` are ISO-8601 timestamps; `limit` is the max number of entries; `providers` is an optional string array so you can force a connector. Always bound the time range before asking for approval on costly scans.
- **Metric queries (`query-metrics`)**: `expression` is the provider-native query string; `step` is a duration string accepted by the provider (e.g., `30s`, `5m`). Timestamps follow ISO-8601.
- **Describe metrics (`describe-metrics`)**: `scope` is the standard query scope.
- **Service queries (`query-services`)**: `ids` is an optional string array; `tags` is a map of string key/value filters.
- **Ticket queries (`query-tickets`)**: `query` is a free-text string; `statuses`/`assignees` are string arrays.

## Resources

- `opsorch://docs/agents-architecture` – serves `AGENTS.md` so clients can retrieve the OpsOrch Agents Architecture content directly.

## Project scripts

- `npm run dev` – run TypeScript entrypoint with ts-node.
- `npm run build` – emit compiled JS to `dist/`.
- `npm start` – run the compiled server from `dist/`.

Fill in `AGENTS.md` as needed; all tools already target the OpsOrch Core HTTP API surfaces.
