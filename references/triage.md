# Issue and PR triage

Set `repo` to the verified `OWNER/REPO`. Use `--state`, `--label` and `--assignee` independently or together. PR state also accepts `merged`. Use the `review-requested:` search qualifier to find open PRs queued for a reviewer. Say when the list is limited; an empty result for one filter is not an empty repository.

```sh
gh issue list -R "$repo" --state open --label "$label" --assignee "$login" --limit 30
gh pr list -R "$repo" --state open --label "$label" --assignee "$login" --limit 30
gh pr list -R "$repo" --state open --search "review-requested:$login" --limit 30
```

## Review and check summary

```sh
gh pr view "$pr" -R "$repo" --json url,isDraft,reviewDecision,reviews,headRefOid
gh pr view "$pr" -R "$repo" --comments
gh pr checks "$pr" -R "$repo" --json name,state,bucket,link
```

Report the overall review decision separately from individual reviewer feedback. If there's no decision, say so rather than assuming approval. To check inline review threads and their resolution state, read the PR's Files changed view when available; the comments command is not a thread-resolution check. Separate passing, pending, failing, and absent checks. For failures, see [Actions diagnosis](actions.md).

## Explicitly requested updates

Check the current target, assignee and label first. Don't create an unknown label or change other assignees automatically. A review request is not an assignment.

```sh
gh issue edit "$issue" -R "$repo" --add-label "$label" --add-assignee "$login"
gh pr edit "$pr" -R "$repo" --add-label "$label" --add-assignee "$login"
gh pr edit "$pr" -R "$repo" --add-reviewer "$login"
gh issue comment "$issue" -R "$repo" --body "$body"
gh pr comment "$pr" -R "$repo" --body "$body"
```

Use only the flags needed for the requested update. Report the resulting change and link. A triage or summary request on its own is read-only.
