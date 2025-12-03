# OpsOrch Agents Architecture

This note describes how OpsOrch agents collaborate to plan and observe operational states through OpsOrch Core and its provider adapters.

## Goals
- Deliver safe, auditable visibility over incidents, tickets, logs, metrics, and services.
- Keep provider specifics isolated behind OpsOrch Core schemas and adapters.
- **Read-only**: Agents currently operate in a read-only capacity, gathering context without mutating state.

## Core principles
- **Observe-then-report**: agents gather data to inform human decision-makers.
- **Least privilege**: agents only call the tools they need.
- **Deterministic I/O**: inputs/outputs align to OpsOrch Core HTTP schemas to remain provider-agnostic.

## Agent roles
### Planner
- **Input**: high-level request (e.g., "Investigate error spikes on service X"), context (service, env), available tools.
- **Output**: ordered plan with read-only tool calls.
- **Responsibilities**: choose relevant tools, thread correlation IDs through steps, propose fallbacks when data is missing.

### Observer
- **Input**: live telemetry/log/ticket/incident data exposed via OpsOrch Core queries.
- **Output**: findings, anomalies, and suggested next actions back to Planner/Human.
- **Responsibilities**: poll or subscribe (where supported) for state changes, detect regressions or success criteria.

### Knowledge curator (optional)
- **Input**: playbooks, runbooks, and prior timelines.
- **Output**: summarized context chunks or prompt-ready snippets.
- **Responsibilities**: keep context windows focused, dedupe repeated evidence, and store post-mortem notes where allowed.

## Tooling and data surfaces
Agents interact only through OpsOrch Core’s normalized APIs (exposed here as MCP tools):
- Incidents: query/get/timeline. Use this for retrieving the canonical incident record and audit trail.
- Tickets: query/get. Track follow-up work here when the outcome needs project management visibility.
- Logs/Metrics: query with scoped filters. Pull telemetry to justify actions, validate hypotheses, or confirm that mitigations are working.
- Services: list/query for ownership and tagging. Resolve the right on-call team, impacted environment, and metadata needed to scope every other tool call.
- Providers: list available capability providers for routing hints. Inspect what back-end connectors are configured.

## Typical flow
1) **Plan**: Planner drafts a sequence of Core tool calls (queries).
2) **Observe**: Observer runs the plan, querying logs/metrics/incidents/tickets.
3) **Report**: Summaries and findings are presented to the user.

## Safety and governance
- Enforce scope (service/team/environment) on all queries to avoid noisy or expensive calls.
- **No mutations**: The current MCP server does not support creating or updating resources.

## Configuration hints
- Core endpoint: `OPSORCH_CORE_URL` (e.g., `http://localhost:8080`).
- Auth: `OPSORCH_CORE_TOKEN` (bearer), secrets stored in configured secret backend.
- Provider selection: `OPSORCH_<CAP>_PROVIDER`/`OPSORCH_<CAP>_PLUGIN`+`OPSORCH_<CAP>_CONFIG` set in Core.
- Agents should pass correlation IDs and scope fields (`service`, `team`, `environment`) on all queries.
