# Default merge policy for task-owned PRs

The user has requested automatic merging once a PR has no outstanding issues. Treat this as standing authorization **only for a PR created for, or explicitly assigned to the main agent in, the current authorized repository task**. It is not permission to discover and merge unrelated PRs, access another repository, create commits, push, open PRs, or broaden platform permissions. A read-only request, an explicit “do not merge”, or a stricter project rule takes precedence. Subagents remain prohibited from merging.

## Eligibility: verify before acting

All of the following must be established for the current PR revision:

1. Confirm repository, PR, target branch, scope, and current head SHA. The PR is open and not a draft. Do not mark a draft ready merely to bypass this gate.
2. Review the actual diff and applicable test evidence. All applicable CI jobs and required checks are complete and successful, with evidence attributable to this PR/head. Pending, cancelled, failed, missing, ambiguous or unexplained skipped checks are not success. If CI genuinely does not apply, obtain an explicit accepted validation alternative rather than treating an empty checks list as a pass.
3. Required approvals are satisfied for the current revision, with no outstanding changes requested, unresolved substantive review findings, or merge conflicts. A check summary or a single approval does not prove all review threads are resolved. Use [triage guidance](triage.md) and repository protection/ruleset information; insufficient visibility means eligibility is unconfirmed.
4. The repository's merge method or queue policy is known and permitted. If no method is established, ask once; do not guess between merge, squash and rebase. Never use admin bypass, disable required checks, dismiss reviews, or change permissions to make the PR eligible.
5. The operation does not trigger an unapproved production deployment or other separately gated side effect. Inspect relevant workflow/deployment configuration when needed; production deployment still needs explicit authorization.

If all gates pass, the main agent merges without another routine “may I merge?” question. If a gate fails or remains unknown, report the blocker and the next useful authorized check. Continue evidence-driven investigation or authorized fixes; never retry merging against the same unresolved condition.

## GitHub execution

For an authorized target, obtain current data using `gh pr view` and `gh pr checks`. Recheck the head immediately before mutation and use `--match-head-commit` to prevent merging an unreviewed update. For example, **only if squash is the established policy**:

```sh
gh pr merge "$pr" -R "$repo" --squash --match-head-commit "$reviewed_sha"
```

Use the established merge/rebase mode instead when required. Follow a required merge queue rather than bypassing it. A queue entry or native auto-merge registration is pending work, not a completed merge; if the revision changes, previous verification no longer suffices. Do not delete branches unless separately authorized.

Read back the result, for example with `gh pr view "$pr" -R "$repo" --json state,mergedAt,mergeCommit,url`, and report the actual state, URL and merge SHA when available. Report failed or unconfirmed readback honestly; do not infer success solely from requesting the merge.

This policy is a behavior rule, not an unattended merge bot or workflow with write permissions. The current Gitea/GitLab previews do not gain unverified merge capabilities from this rule; use only a verified supported platform path, otherwise report the missing prerequisite.

## Rule-review scenarios

These are expected decisions, not evidence of a live platform merge:

| Situation | Decision |
| --- | --- |
| Task-owned, non-draft PR; current checks/approvals pass; squash policy known; no gated deployment | Merge the reviewed SHA without another routine confirmation, then verify the result. |
| Pending checks or unknown required-check status | Wait within a bounded observation period or report blocked; do not merge. |
| “Only review; do not merge” | Remain read-only even if all checks pass. |
| Head changed after review, or unresolved review finding | Re-evaluate the new revision; no stale-SHA merge. |
| Draft, unrelated PR, unknown merge method, or production deployment not authorized | Stop at that gate and request the specific missing decision. |
