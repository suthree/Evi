# Review Inbox Decision Log

## Status

Done

## Goal

Let the operator explicitly mark review tick inbox suggestions as open,
deferred, completed, or retired without mutating the original
`autonomy/inbox/*.json` artifact or executing the suggested follow-up.

## Scope

- Add an append-only `autonomy/review-inbox-decisions.jsonl` decision log.
- Add CLI `review decide-inbox --item <ref-or-id> --status open|deferred|completed|retired --reason "..."`.
- Merge the latest decision into review inbox read models.
- Suppress `completed` and `retired` inbox items from active Opportunity
  Backlog and context attention.
- Keep `deferred` inbox items visible with lower priority and block confirmation
  until reopened with `open`.
- Keep Feishu read-only while showing the latest decision and matching CLI
  commands.

## Acceptance

- CLI parsing recognizes `review decide-inbox`.
- Runtime appends decisions and rejects confirmation requests for non-`open`
  decisions.
- Runtime returns the actual JSONL row ref for each appended decision, even
  when two local decisions are issued close together.
- Opportunity Backlog consumes the latest review inbox decision.
- Context governance queue consumes the latest review inbox decision.
- Feishu `/review inbox` and `/review inbox <ref-or-id>` render decision state
  without running mutations.
- Focused tests and full checks pass.
