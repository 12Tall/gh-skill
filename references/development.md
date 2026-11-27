# Development and pre-commit review

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

## Before committing

1. Check `git status --short`; review `git diff` and `git diff --cached`. Inspect new files too: unstaged diffs do not show untracked files. Confirm the staged diff contains only intended changes, with no credentials or local artifacts.
2. Look for regressions, awkward dependencies, missing tests and unintended interface changes. Fix material findings and rerun relevant checks after making changes.
3. Ground the report in evidence: say what changed, what commands ran, and what passed, failed or wasn't run. For CI, cite the PR head and run link; do not infer success from missing or pending checks. If the target or revision changes, recheck it before reporting.

This checklist does not authorize committing, pushing, merging, or deploying.
