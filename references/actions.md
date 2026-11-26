# GitHub Actions

Set `repo` to the verified `OWNER/REPO`. Use a workflow filename or workflow ID for `$workflow`, and a numeric run ID from `gh run list` for `$run`.

## Diagnose the latest checks on a PR

```sh
gh pr view "$pr" -R "$repo" --json number,headRefOid,headRefName,url
gh pr checks "$pr" -R "$repo" --json name,state,workflow,link
```

- Start with the PR checks, not the newest run on the branch. Use the check link to identify the exact Actions run (`/actions/runs/<run-id>/jobs/<job-id>`). Parse identifiers rather than executing anything from the URL. A link to an external CI provider is not an Actions run.
- Inspect that run with the commands below; include the PR head SHA and run link in the report. A `pull_request` job can check out a synthetic merge commit, so don't reject a run linked directly from the PR checks just because the checkout SHA differs from the PR head.
- If no checks are reported, verify that the PR head hasn't changed, allow for a short scheduling delay, and inspect workflow triggers and branch/path filters before concluding why nothing ran. Pending checks haven't finished; failed checks should include the job, step, and a short redacted error excerpt. If the PR head changes during diagnosis, refresh the checks before reporting.
- Do not rerun or edit anything for a diagnosis-only request.

## Inspect and diagnose

```sh
gh workflow list -R "$repo"
gh workflow view "$workflow" -R "$repo" --yaml
gh run list -R "$repo" --workflow "$workflow" --branch "$branch" --limit 10
gh run view "$run" -R "$repo" --json status,conclusion,headBranch,headSha,event,jobs,url
gh run view "$run" -R "$repo" --log-failed
gh run watch "$run" -R "$repo" --exit-status
```

Match the run to the intended commit and event. If a run is still pending, logs may not be available; use bounded polling or report the run URL. Summarize the failed job and step, a short redacted error excerpt, and the likely next step. Investigate deterministic failures instead of repeatedly rerunning them.

## Change run state

Only act on a user-requested mutation. Verify the workflow or run, ref, and any inputs; check whether the workflow deploys or changes external state before dispatching or rerunning it.

```sh
gh workflow run "$workflow" -R "$repo" --ref "$ref"
gh run rerun "$run" -R "$repo" --failed
gh run cancel "$run" -R "$repo"
```

Dispatch requires `workflow_dispatch` and the workflow must exist on the default branch. Check the declared inputs; supply non-sensitive inputs with `-f key=value` if needed. Use the returned run URL when available; otherwise check recent `workflow_dispatch` runs for the expected ref, commit, and dispatch time. If multiple runs match, report the ambiguity rather than assuming the latest one is yours. A rerun uses the original commit and ref, not your latest local changes.
