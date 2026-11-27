# Development and pre-commit review

## Lightweight task intake

For each incoming request:

1. Identify intent: discussion/question, executable work, or a standing constraint. Answer discussions without silently creating an implementation task. Keep durable rules separate from task status; do not edit persistent instructions or create a task file unless requested or approved.
2. Reuse known context. If a missing goal, scope, acceptance criterion, or priority would materially change the work, ask the smallest useful question and clarify progressively. Do not turn clear requests into a mandatory questionnaire.
3. Keep one current main goal and a short list of independent side tasks. Classify clear requests automatically; ask before starting a side task that would interrupt the main goal or expand scope. An explicit instruction to switch priority is already a decision, not a reason to ask again. Remember where the main task paused and its concrete next step.
4. Track only relevant states: awaiting clarification, ready, in progress, awaiting validation, blocked, awaiting commit/push, or complete. Distinguish implementation complete from pending publication. Never invent unfinished work. Keep this lightweight in conversation by default, not a new persistent task system.
5. Execute clear, bounded, authorized work without redundant plan/edit confirmations. Verification remains included unless explicitly waived, and existing approval gates for commits, pushes, delegation, external resources, and high-risk actions remain intact. If the user explicitly requests confirmation at every stage, honor that stricter mode.
6. Summarize state only when switching tasks, encountering a blocker, or finishing work. At completion, report relevant verification, unfinished main/side work, and the next step; ask about any remaining commit/push decision. Do not repeat a full task tree after every message.

Rule-review scenarios (expected decisions, not live agent test results):

| Request or situation | Expected handling |
| --- | --- |
| “Fix this typo” with an exact file and text | Classify and edit within the authorized scope, then verify; no repeated plan approval. |
| “Would a cache help?” during another task | Discuss only; do not implement or silently pause the main task. |
| “Improve performance” with unclear target | Ask which workload or measurable outcome matters before choosing changes. |
| Unrelated new work while the main goal is active | List as a side task; ask about priority if starting it would interrupt the main goal. |
| “Pause this and fix that first” | Switch as requested, record the paused main step; do not ask the same priority question again. |
| “Always run tests” | Track as a standing constraint, not an endless side task; persistence needs authorization. |
| Implementation verified, no commit approval | Report awaiting commit/push and ask; do not mark publication complete. |

## Conversation checkpoint

- Answer side questions without silently replacing the last agreed task. When the tangent is resolved or starts crowding out the task, briefly summarize its outcome and state one concrete next step on the main task. Don't repeat the checkpoint every turn.
- If pursuing the tangent would pause or expand the task, ask whether to switch or defer. Without that decision, do not start edits or open a PR for the tangent. A proposed idea is not an accepted decision.
- After a long interruption, recover the last agreed goal, decisions, and next step from the conversation and any existing project state notes. If they conflict or the goal is unclear, ask one focused question rather than guessing. Do not create a tracking file unless requested.

### Context checkpoint

If the harness exposes reliable context usage and it reaches roughly 60%, prepare a short handoff at the next safe pause. Preserve the agreed goal, decisions, authorization scope, pending work, verification results, and one concrete next step. Keep side topics only if they affect the main task. Resume the agreed task after compaction; a summary is not permission to expand scope. If usage is unavailable, do not guess a percentage; use the same handoff when pausing a long task. This is a Skill-level checkpoint, not a setting that triggers or changes the harness's automatic compaction.

## Before editing

- State the goal and how to verify it. A small change needs only a short acceptance check. For changes across modules or to public interfaces, explain the affected callers, compatibility risks, and verification plan before editing.
- Keep responsibilities separate. For example, find reference files relative to the Skill, but resolve the GitHub target from the project or the user's explicit request. Moving the Skill must not change the target repository.

## While editing

- Follow local conventions. Prefer clear names and straightforward control flow. Extract a function when naming a distinct responsibility makes the caller easier to read or lets you test that behavior separately; don't split code just to make it shorter.
- Keep the diff focused. Change the module that owns the behavior instead of spreading its rules across callers. Avoid speculative abstractions and unrelated cleanup.
- Give shared rules one source of truth. Ask: if this value changes, must these callers change together? If yes, define it in the module that owns the rule; put environment-dependent values in configuration, and read facts like a target repository's default branch from the system that owns them. If callers also repeat the same decision logic, share a function. Keep coincidentally equal values separate: this repository's default branch and the default for newly created repositories are independent policies. Avoid a catch-all constants file.
- Verify every task against its acceptance conditions, including main tasks, side tasks, and ad hoc requests; skip only on explicit user instruction. Relevant validation is included in an authorized task, but does not expand external-access or side-effect permissions. Use the project's existing checks and add focused regression checks where practical; unrelated passing tests do not prove new behavior works. For instruction changes, review consistency and representative success, refusal, and approval-boundary scenarios. Distinguish static checks and scenario review from live agent execution. Report blocked checks and their reasons, or explicitly requested skips, rather than claiming they passed.

## Function compatibility and migration

Prefer compatible changes over changing an existing function's signature. Compatibility includes parameter names and defaults where callers depend on them, return values and types, exceptions, sync/async behavior, and observable side effects—not just the signature.

Before changing a function, inspect its contract and affected callers. Use repository search and available language-aware reference tools to find direct calls, aliases, re-exports, callbacks, interface implementations, overrides, overloads, tests, mocks, configuration, and documentation. Consider reflective or string-based calls and consumers outside this repository. State the searched scope and any unresolved consumers; a text search with zero matches is not proof that no callers exist. Investigating external consumers still requires authorization.

- For an internal change with a stable contract and understood impact, modify the existing implementation and run focused regression tests. Do not introduce a duplicate function solely to follow a migration ritual.
- If a signature or behavioral breaking change is necessary, explain why and the compatibility risks before editing. Prefer introducing a new implementation and keeping the old entry point as a compatibility adapter when that adapter can preserve the old contract. Avoid duplicated business logic and do not hide incompatible behavior behind an adapter that only preserves the old name.
- Migrate all known affected callers and related interfaces, mocks, tests, configuration, and documentation consistently within the authorized scope. A small, fully internal API may be updated atomically when every consumer is known; a new function is not mandatory in that case. Do not silently modify another project or claim its consumers are migrated.
- Verify the old contract while the adapter remains, the new behavior, migrated callers, failure paths, and relevant integration paths. Run available type/build checks as appropriate. Passing isolated tests for the new function alone is insufficient.
- Remove the old entry point only after all known consumers are migrated, relevant checks pass, and compatibility obligations are satisfied. For public APIs or possible external consumers, deprecate first and provide migration guidance and an explicit removal/versioning decision. If consumer status is unknown, retain compatibility or report the migration as blocked; do not infer permission to break consumers from zero local references.
- Keep transitional adapters narrowly scoped and document their removal conditions. Do not leave an untracked second implementation indefinitely.

### Rule-review scenarios

These are expected decisions for reviewing the instruction, not evidence of live agent execution:

| Scenario | Required decision and verification |
| --- | --- |
| Internal refactor, signature and behavior unchanged | Modify in place; test affected callers and behavior. No mandatory new function. |
| Necessary signature change, all internal callers known | Explain impact; migrate atomically or use a temporary adapter; update interfaces/mocks/docs and run caller, type/build, and integration checks. |
| Public API, no local references, new-function tests pass | Do not delete on that evidence alone; check compatibility obligations, deprecate and plan migration/removal. |
| Callback or reflective use, external consumers unknown | Expand authorized local investigation; retain compatibility or report blocked verification. Do not access other projects without permission. |
| Signature unchanged, return type or exception behavior changes | Treat it as a potential breaking change; validate the old contract and follow the migration path if incompatible. |

## Before committing

1. Check `git status --short`; review `git diff` and `git diff --cached`. Inspect new files too: unstaged diffs do not show untracked files. Confirm the staged diff contains only intended changes, with no credentials or local artifacts.
2. Look for regressions, awkward dependencies, missing tests and unintended interface changes. Fix material findings and rerun relevant checks after making changes.
3. Ground the report in evidence: say what changed, what commands ran, and what passed, failed or wasn't run. For CI, cite the PR head and run link; do not infer success from missing or pending checks. If the target or revision changes, recheck it before reporting.

This checklist does not authorize committing, pushing, merging, or deploying.
