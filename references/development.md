# Development and pre-commit review

## Before editing

- State the goal and how to verify it. A small change needs only a short acceptance check. For changes across modules or to public interfaces, explain the affected callers, compatibility risks, and verification plan before editing.
- Keep responsibilities separate. For example, find reference files relative to the Skill, but resolve the GitHub target from the project or the user's explicit request. Moving the Skill must not change the target repository.

## While editing

- Follow local conventions. Prefer clear names and straightforward control flow. Extract a function when naming a distinct responsibility makes the caller easier to read or lets you test that behavior separately; don't split code just to make it shorter.
- Keep the diff focused. Change the module that owns the behavior instead of spreading its rules across callers. Avoid speculative abstractions and unrelated cleanup.
- Give shared rules one source of truth. Ask: if this value changes, must these callers change together? If yes, define it in the module that owns the rule; put environment-dependent values in configuration, and read facts like a target repository's default branch from the system that owns them. If callers also repeat the same decision logic, share a function. Keep coincidentally equal values separate: this repository's default branch and the default for newly created repositories are independent policies. Avoid a catch-all constants file.
- Test the acceptance condition; for bug fixes, add a regression test when practical. Use the project's existing checks.

## Before committing

1. Check `git status --short`; review `git diff` and `git diff --cached`. Inspect new files too: unstaged diffs do not show untracked files. Confirm the staged diff contains only intended changes, with no credentials or local artifacts.
2. Look for regressions, awkward dependencies, missing tests and unintended interface changes. Fix material findings and rerun relevant checks after making changes.
3. Ground the report in evidence: say what changed, what commands ran, and what passed, failed or wasn't run. For CI, cite the PR head and run link; do not infer success from missing or pending checks. If the target or revision changes, recheck it before reporting.

This checklist does not authorize committing, pushing, merging, or deploying.
