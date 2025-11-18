# opsorch-mcp

opsorch-mcp is the Model Context Protocol (MCP) server for OpsOrch. It exposes OpsOrch Core HTTP APIs as safe MCP tools for LLM and agent runtimes.

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
npm run dev
```

### Quick HTTP MCP checks (curl)

HTTP transport here runs stateless: you can issue a single POST per call (no session or initialize required). Include the Accept header:

```
# list tools
curl -s http://localhost:7070/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# call the health tool
curl -s http://localhost:7070/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"health","arguments":{}}}'

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

- `health` – GET /health
- `list-providers` – GET /providers/{incident|log|metric|ticket|messaging|service}
- `list-incidents` – GET /incidents
- `query-incidents` – POST /incidents/query
- `create-incident` – POST /incidents
- `get-incident` – GET /incidents/{id}
- `update-incident` – PATCH /incidents/{id}
- `get-incident-timeline` – GET /incidents/{id}/timeline
- `append-incident-timeline` – POST /incidents/{id}/timeline
- `query-logs` – POST /logs/query
- `query-metrics` – POST /metrics/query
- `query-services` – POST /services/query
- `list-services` – GET /services
- `query-tickets` – POST /tickets/query
- `create-ticket` – POST /tickets
- `get-ticket` – GET /tickets/{id}
- `update-ticket` – PATCH /tickets/{id}
- `send-message` – POST /messages/send

## Resources

- `opsorch://docs/agents-architecture` – serves `AGENTS.md` so clients can retrieve the OpsOrch Agents Architecture content directly.

## Project scripts

- `npm run dev` – run TypeScript entrypoint with ts-node.
- `npm run build` – emit compiled JS to `dist/`.
- `npm start` – run the compiled server from `dist/`.

Fill in `AGENTS.md` as needed; all tools already target the OpsOrch Core HTTP API surfaces.
