# Gitea: unverified preview

This is a workflow preview, not a claim of support for any live instance. Use the common authorization and development rules in `SKILL.md`. Do not install or log into `tea` on the user's behalf. Check `tea --version` and command help locally before relying on flags; the published v0.16.0 source is the initial reference.

## Resolve the target before doing network work

Use the explicitly requested instance and repository, then a project-configured default if unambiguous. Treat that default as routing information, not permission. Check the project's local remotes; verify both fetch and push URLs where relevant. If the platform, instance, namespace, or destination conflicts or is ambiguous, ask. Never assume `origin` or send credentials to a different instance.

In a same-repository workflow, use the verified repository as both source and destination. In a Fork workflow, confirm the existing source Fork and its relationship to the destination with authorized read-only metadata on the same instance. Push only to that Fork and create the PR against the upstream repository. Do not create a Fork or silently switch remotes after a failed push.

## Before any push

1. Confirm the intended source repository, source branch, upstream repository, base branch, and permission to push and create the PR. For a Fork, check that the authorized scope covers both repositories. Preserve local work if verification fails.
2. Check for trustworthy instance-specific evidence that the server treats `WIP:` as a draft and blocks merging. The presence of `tea --draft`, the server version, the default in upstream documentation, and a title beginning with `WIP:` are not sufficient evidence. If unsupported or unknown, stop **before pushing** and ask whether to open an ordinary PR or keep the work local. Do not probe by creating a PR.
3. Apply the shared development checklist. If the intended commit has material findings or verification is blocked, stop. Once the checks and authorization are in place, push the verified topic branch without force and use `tea pulls create` with the verified upstream and exact login selected explicitly (check installed help). For an existing Fork use `--head "$fork_owner:$branch"`; for the same repository use `--head "$branch"`. Always name `--base "$base"`. Use `--draft` only with confirmed protection; never silently retry as an ordinary PR.

## After creation: read-only checks

Read back the PR from the upstream and report its URL and current head SHA. Use only runs or commit statuses attributable to that PR and revision. For Actions, prefer PR-linked run evidence; if available and authorized, Gitea's repository runs API supports `head_sha`. A push run and a PR run can share a SHA, and a Fork may have its own runs: do not substitute the latest branch run or an unrelated Fork run. Report passing, failing, running, or no checks observed; identify ambiguous attribution instead of guessing. Do not rerun, trigger, cancel, merge, edit, or push a fix as part of checking CI.
