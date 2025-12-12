# opsorch-mcp

[![Version](https://img.shields.io/github/v/release/OpsOrch/opsorch-mcp)](https://github.com/OpsOrch/opsorch-mcp/releases)
[![License](https://img.shields.io/github/license/OpsOrch/opsorch-mcp)](https://github.com/OpsOrch/opsorch-mcp/blob/main/LICENSE)
[![CI](https://github.com/OpsOrch/opsorch-mcp/workflows/CI/badge.svg)](https://github.com/OpsOrch/opsorch-mcp/actions)

opsorch-mcp is the Model Context Protocol (MCP) server for OpsOrch. It exposes OpsOrch Core HTTP APIs as safe, read-only MCP tools for LLM and agent runtimes.

## Getting started

### Local Development

```bash
npm install
npm run dev    # runs via ts-node over stdio
# or
npm run build && npm start
```

The server uses stdio transport by default; spawn it from your MCP client (e.g., Claude Code, MCP Inspector, Cursor) pointing to the compiled `dist/index.js`.

### Docker

Docker images are automatically built and published to GitHub Container Registry with each release. You can run the MCP server using Docker:

```bash
# Pull the latest version
docker pull ghcr.io/opsorch/opsorch-mcp:latest

# Run with environment variables
docker run -d \
  --name opsorch-mcp \
  -p 7070:7070 \
  -e OPSORCH_CORE_URL=http://localhost:8080 \
  -e OPSORCH_CORE_TOKEN=changeme \
  -e MCP_HTTP_PORT=7070 \
  ghcr.io/opsorch/opsorch-mcp:latest

# Or run a specific version
docker pull ghcr.io/opsorch/opsorch-mcp:v1.0.0

# Using Docker Compose
cat > docker-compose.yml << EOF
version: '3.8'
services:
  opsorch-mcp:
    image: ghcr.io/opsorch/opsorch-mcp:latest
    ports:
      - "7070:7070"
    environment:
      - OPSORCH_CORE_URL=http://localhost:8080
      - OPSORCH_CORE_TOKEN=changeme
      - OPSORCH_LOG_LEVEL=info
      - MCP_HTTP_PORT=7070
    restart: unless-stopped
EOF

docker-compose up -d
```

**Available Docker tags:**
- `latest` - Latest stable release
- `v{version}` - Specific version tags (e.g., `v1.0.0`, `v1.1.0`)

The Docker image runs as a non-root user and exposes port 7070 by default (configurable via `MCP_HTTP_PORT` environment variable). The image supports both stdio and HTTP transports for MCP communication.

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

# query deployments
curl -s http://localhost:7070/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"query-deployments","arguments":{"statuses":["success"],"environments":["production"],"limit":10}}}'

# get deployment
curl -s http://localhost:7070/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get-deployment","arguments":{"id":"deploy-123"}}}'
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
- `query-deployments` – POST /deployments/query
- `get-deployment` – GET /deployments/{id}
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
- **Deployment queries (`query-deployments`)**: `query` is a free-text string; `statuses`/`environments` are string arrays; supports standard scope filtering for targeted deployment searches.

## Resources

- `opsorch://docs/agents-architecture` – serves `AGENTS.md` so clients can retrieve the OpsOrch Agents Architecture content directly.

## Project scripts

- `npm run dev` – run TypeScript entrypoint with ts-node.
- `npm run build` – emit compiled JS to `dist/`.
- `npm start` – run the compiled server from `dist/`.

Fill in `AGENTS.md` as needed; all tools already target the OpsOrch Core HTTP API surfaces.

## Releases

This project uses automated releases via GitHub Actions. Releases are triggered manually and include:

- **Semantic versioning** with configurable version bumps (major, minor, patch)
- **Automated testing** and linting before release
- **Git tagging** with proper version format (`v{major}.{minor}.{patch}`)
- **Changelog generation** from commit history
- **Docker image publishing** to GitHub Container Registry
- **GitHub releases** with release notes



### Creating a Release

Maintainers can create a new release by:

1. Go to the [Actions tab](https://github.com/OpsOrch/opsorch-mcp/actions)
2. Select the "Release" workflow
3. Click "Run workflow"
4. Choose the version bump type:
   - **patch** - Bug fixes and minor updates (1.0.0 → 1.0.1)
   - **minor** - New features, backward compatible (1.0.0 → 1.1.0)  
   - **major** - Breaking changes (1.0.0 → 2.0.0)
5. Click "Run workflow"

The release process will automatically:
- Run all tests and linting
- Calculate the next version number
- Create and push a git tag
- Build and publish Docker images for multiple architectures (linux/amd64, linux/arm64)
- Create a GitHub release with changelog

### Installation Options

**Docker:**
```bash
docker pull ghcr.io/opsorch/opsorch-mcp:latest
```

**GitHub Releases:**
Download release artifacts from the [Releases page](https://github.com/OpsOrch/opsorch-mcp/releases).
