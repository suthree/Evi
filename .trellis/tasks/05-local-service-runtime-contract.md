# Task 05: Local Service Runtime Contract

## Goal

Make the local single-user service runtime an explicit MVP capability without
expanding into hosted, multi-user, deployment, or cross-machine service design.

## Scope

- Update the Trellis MVP spec to allow a local service runtime.
- Record the decision that service mode is single-user and local-only.
- Update stable runtime docs to include `service install|start|stop|restart|status|logs|uninstall`.
- Document service state, logs, heartbeat, local runtime snapshot, and restart
  workflow.
- Keep Feishu IM as the first service target.

## Non-Goals

- No hosted daemon.
- No multi-user service.
- No production deployment.
- No Docker or Kubernetes packaging.
- No cross-machine state or vault sync.
- No GUI service dashboard.

## Verification

- `pnpm run check` passes.
- `pnpm run runtime -- service status --target im` reports a loaded local
  service with heartbeat when the service is running.
- Stable docs no longer claim that local service runtime is out of scope.

## Status

Completed.
