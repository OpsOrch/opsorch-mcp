# OpsOrch Agents Architecture

This note describes how OpsOrch agents collaborate to plan, execute, and verify operational actions through OpsOrch Core and its provider adapters.

## Goals
- Deliver safe, auditable automation over incidents, tickets, logs, metrics, services, and messaging.
- Keep provider specifics isolated behind OpsOrch Core schemas and adapters.
- Preserve human control with explicit confirmations on high-risk steps.

## Core principles
- **Plan-then-act**: planning is separated from execution; actions require explicit tool calls.
- **Least privilege**: agents only call the tools they need; sensitive configs live in secret backends.
- **Deterministic I/O**: inputs/outputs align to OpsOrch Core HTTP schemas to remain provider-agnostic.
- **Traceability**: every mutating call is logged with correlation IDs and timeline updates where possible.

## Agent roles
### Planner
- **Input**: high-level request (e.g., "Investigate error spikes on service X"), context (service, env), available tools.
- **Output**: ordered plan with tool calls and decision points; identifies human-approval gates for risky steps.
- **Responsibilities**: choose relevant tools, minimize blast radius, thread correlation IDs through steps, propose fallbacks when data is missing.

### Executor
- **Input**: approved plan steps.
- **Output**: tool responses, mutations (incidents/tickets/messages), and structured status updates.
- **Responsibilities**: invoke OpsOrch Core tools with validated payloads, handle retries with bounded backoff, append timelines for changes, and surface failures with enough context to resume.

### Observer
- **Input**: live telemetry/log/ticket/incident data exposed via OpsOrch Core queries.
- **Output**: findings, anomalies, and suggested next actions back to Planner/Human.
- **Responsibilities**: poll or subscribe (where supported) for state changes, detect regressions or success criteria, and avoid mutating state.

### Knowledge curator (optional)
- **Input**: playbooks, runbooks, and prior timelines.
- **Output**: summarized context chunks or prompt-ready snippets.
- **Responsibilities**: keep context windows focused, dedupe repeated evidence, and store post-mortem notes where allowed.

## Tooling and data surfaces
Agents interact only through OpsOrch Core’s normalized APIs (exposed here as MCP tools):
- Incidents: list/query/create/update, timelines. Use this for creating or modifying the canonical incident record and attaching evidence so humans can trace exactly what happened.
- Tickets: query/create/update/get. Track follow-up work here when the outcome needs project management visibility beyond the incident lifecycle.
- Logs/Metrics: query with scoped filters. Pull telemetry to justify actions, validate hypotheses, or confirm that mitigations are working before taking additional steps.
- Services: list/query for ownership and tagging. Resolve the right on-call team, impacted environment, and metadata needed to scope every other tool call.
- Messaging: send updates to channels/threads. Broadcast status, approvals, and next steps to stakeholders without leaving OpsOrch.
- Providers: list available capability providers for routing hints. Inspect what back-end connectors are configured so the plan can target supported surfaces only.

## Typical flow
1) **Plan**: Planner drafts a sequence of Core tool calls with guardrails.
2) **Confirm** (optional): Human approves risky steps (e.g., paging, ticket creation, broad log scans).
3) **Execute**: Executor runs the plan, logging each mutation and attaching correlation IDs.
4) **Observe**: Observer queries logs/metrics/incidents/tickets to confirm success or surface follow-ups.
5) **Report**: Summaries and timelines are sent via messaging and appended to incidents/tickets as appropriate.

## Safety and governance
- Require explicit human approval for paging, ticket creation, incident severity changes, or bulk log queries.
- Enforce scope (service/team/environment) on all queries to avoid noisy or expensive calls.
- Prefer read-only tools first; escalate to mutating calls only when justified by observed signals.
- Capture evidence (log snippets, metric deltas) alongside mutations in timelines for auditability.

## Configuration hints
- Core endpoint: `OPSORCH_CORE_URL` (e.g., `http://localhost:8080`).
- Auth: `OPSORCH_CORE_TOKEN` (bearer), secrets stored in configured secret backend.
- Provider selection: `OPSORCH_<CAP>_PROVIDER`/`OPSORCH_<CAP>_PLUGIN`+`OPSORCH_<CAP>_CONFIG` set in Core.
- Agents should pass correlation IDs and scope fields (`service`, `team`, `environment`) on all queries/mutations.
