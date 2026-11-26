# gh-skill

给 Pi 使用的 GitHub CLI Skill。第一版覆盖仓库、Issue、PR，以及 GitHub Actions 的查询、日志排查、手动触发、失败重跑和取消。

## 仅在指定项目启用

需要 Pi、Git、已登录的 `gh`，以及对私有仓库 `12Tall/gh-skill` 的读取权限。在目标 Git 项目的根目录执行（要求安装目录不存在）：

```sh
install_dir=.agents/skills/gh-skill
exclude_file=$(git rev-parse --git-path info/exclude)
mkdir -p .agents/skills
printf '\n/.agents/skills/gh-skill/\n' >> "$exclude_file"
gh repo clone 12Tall/gh-skill "$install_dir"
```

排除规则只写入本地 Git 配置目录，不改项目的 `.gitignore`，也不把 Skill 提交到目标项目。更新时运行 `git -C .agents/skills/gh-skill pull --ff-only`，然后在 Pi 中执行 `/reload` 或重启 Pi。

**启用步骤还包括项目指引。** 将下面一行加入目标项目根目录的 `AGENTS.md`（没有就创建，不覆盖已有内容）。Pi 每次启动都会读项目指引；只克隆 Skill 并不能保证模型在提交前自动选用它。若不想共享这次配置，不要暂存该文件的改动。

```text
本项目启用 gh-skill：每次由 Pi 创建 Git 提交前（包括 amend），必须先读取 .agents/skills/gh-skill/references/development.md，审查将要提交的 diff 并运行相关检查；有实质问题或验证受阻时先停下汇报，不要提交。自审不等于提交授权。
```

这是对 Pi 的项目级约束，不是 Git hook，不拦截你在终端手动执行的 `git commit`。

从目标项目启动 `pi`（不需要 `--skill`）。先用 `/skill:gh-skill 只读查看当前仓库和默认分支` 验证加载。

## 快速上手

复制下面的指令到 Pi，把示例编号换成目标项目里的编号：

| 任务 | 指令 |
| --- | --- |
| 整理待办 | `/skill:gh-skill 按标签和负责人汇总当前仓库未关闭的 Issue，只读` |
| 从 Issue 开 Draft PR | `/skill:gh-skill 实现 Issue #12，本地检查通过后开 Draft PR，并查看 CI` |
| 提交前自审 | `/skill:gh-skill 按开发清单审查本地改动，指出耦合、重复规则和漏测；只读，不提交` |
| 诊断 PR 的 CI | `/skill:gh-skill 检查 PR #42 最新提交的 CI；如果失败，汇报失败步骤和关键日志，不重跑` |

[开发与自审清单](references/development.md)随 Skill 一起安装和更新，无需额外配置。通过上面的指令，即使没有 GitHub Issue 或 PR，也能用它审查本地改动。

有关开发习惯、对话主线和项目外资源授权的约定，见[常见问题](references/faq.md)。

整理、诊断和仅审查默认只读。只说「实现 Issue」时，Pi 在本地修改和验证后停下，不自动提交或推送。明确要求开 Draft PR 时，才进入提交、推送和开 PR 的流程。加标签、指派、评论和手动重跑也需要明确授权；合并与生产部署要单独确认。
