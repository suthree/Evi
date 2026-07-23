# ADR 0002: Environment baseline before new self-evolution Goals

- Status: Accepted
- Date: 2026-07-20
- Decision owner: Operator

## Decision

Before a new self-evolution Goal changes source, Evi must establish an
Environment Baseline. It classifies each inherited item as active with an
owner, explicitly deferred, archived historical evidence, or retired with a
recovery path. It also separates current repository changes by owner and
disposition, verifies worktree/branch/stash state, and checks runtime health
and deployment identity.

The baseline is logical cleanliness, not a state wipe. Historical evidence,
frozen `.trellis/` records, and recoverable runtime artifacts remain available;
they are not silently deleted to make an environment appear clean. Existing
uncommitted changes may be committed, moved to an isolated worktree, or retained
only after their owner and recovery path are explicit. This gate is accepted
policy; its automatic enforcement in `GoalRuntime` is not yet implemented.

An archive is historical evidence, not default context or an active instruction
source. A new Goal may retrieve an archived item only by explicit identifier and
must retain its capture date, origin, and historical status. Current accepted
ADRs, active-Goal evidence, and verified runtime facts take precedence. When an
archive conflicts with them, retain it as superseded or conflicting evidence and
exclude it from active context; do not delete it merely to remove ambiguity.
Deletion is reserved for a separately authorised security, privacy, legal, or
storage-retention action with a recovery record or non-sensitive tombstone.

## Consequences

- New source-mutating self-evolution is paused until the baseline report has
  a Decision Owner-approved disposition for current work and historical state.
- Read-only diagnosis and a bounded Direction Proposal remain allowed while the
  baseline is incomplete.
- Archive, retirement, commit, worktree move, or deletion actions remain
  separate effects with their own verification and recovery evidence.
- Until archive-status and precedence checks are automated, an operator or
  harness review must make archived retrieval explicit before it affects a
  self-evolution decision.
