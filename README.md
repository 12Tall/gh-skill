# gh-skill

主要给 **Pi coding agent** 使用的项目级 Skill。它把 Git、平台 CLI 和提交前自审串起来：先用工具核验事实，再根据结果决定下一步（ReAct）。适合整理 Issue、从需求开发到开 PR、排查 CI，以及不联网的本地代码审查。

| 场景 | 用途与范围 |
| --- | --- |
| 本地 Git | 看 diff、查历史、按开发清单审查改动；不需要平台 Token。提交和推送遵守授权规则。 |
| GitHub | 用 `gh` 处理仓库、Issue、PR 和 Actions，包括查询、日志诊断及明确授权的运行操作。 |
| Gitea | 预览：用 `tea` 查询，已在 `gitea.com` 验证同仓库普通和草稿 PR；也可用 SSH 推送后在网页操作。 |
| GitLab.com | 有限只读预览：用 `glab` 查询 Issue、MR 和流水线。同仓库 Draft MR 已单独实测，未启用自动写入。 |

## 安装到指定 Pi 项目

安装只需要 **Pi 和 Git**。本仓库公开，克隆不需要 GitHub 登录；只有执行具体平台操作时，才需要相应的 CLI 和授权，见[认证指南](references/authentication.md)。

在**要使用 Skill 的 Git 项目根目录**执行，安装目录须不存在：

```sh
git clone https://github.com/12Tall/gh-skill.git .agents/skills/gh-skill
```

如果只想本地使用，不把 Skill 加入目标仓库，执行下面这段。它只修改当前 Git 仓库的本地排除文件，不改 `.gitignore`：

```sh
exclude_file=$(git rev-parse --git-path info/exclude) &&
  { grep -qxF '/.agents/skills/gh-skill/' "$exclude_file" 2>/dev/null ||
    printf '\n/.agents/skills/gh-skill/\n' >> "$exclude_file"; }
```

从目标项目启动 `pi`，无需传 `--skill`。首次验证试用：`/skill:gh-skill 只读审查本地改动，不访问 GitHub`。如果 Pi 已经在运行，执行 `/reload` 或重启。

**更新或固定版本：**默认安装跟随 `master`，更新用 `git -C .agents/skills/gh-skill pull --ff-only`。想固定在已发布版本，可在克隆时加 `--branch v0.4.1`；固定安装要切换到新的发布标签，而不是运行 `pull`。更新后重载 Pi。卸载时先移除可选的扩展链接和你加到 `AGENTS.md` 的那一行，再移除 Skill 安装目录并重载 Pi。

### 启用默认提交前自审

如果希望 Pi 在你只说「请提交」时也自动使用开发清单，将下面一行加入目标项目根目录的 `AGENTS.md`（没有就创建，不覆盖已有内容）。Pi 每次启动都会读项目指引；只克隆 Skill 并不能保证模型在提交前自动选用它。若不想共享这次配置，不要暂存该文件的改动。

```text
本项目启用 gh-skill：每次由 Pi 创建 Git 提交前（包括 amend），必须先读取 .agents/skills/gh-skill/references/development.md，审查将要提交的 diff 并运行相关检查；有实质问题或验证受阻时先停下汇报，不要提交。自审不等于提交授权。
```

这是对 Pi 的项目级约束，不是 Git hook，不拦截你在终端手动执行的 `git commit`。

## 可选：约 60% 时自动压缩

在**已信任的目标项目**根目录执行以下命令，为该项目显式启用随 Skill 提供的 Pi 扩展，然后重启 Pi。仅克隆 Skill 不会加载扩展。扩展具有 Pi 进程的权限，请先审阅代码。

```sh
mkdir -p .pi/extensions
ln -s ../../.agents/skills/gh-skill/pi/context-compaction.js .pi/extensions/gh-skill-context-compaction.js
```

扩展在一轮工作完成后按**当前模型**的上下文窗口检查估算用量，达到约 60% 时请求压缩。同一轮超阈值状态不会反复请求。如果 Pi 已禁用自动压缩，扩展也不会触发。它不改全局设置，也不替换 Pi 原生的溢出恢复或自动压缩；因此不是每个 token 都检查的硬阈值。只想本地启用时，不要提交该链接；关闭时移除该链接并重启 Pi。

## 本仓库的开发检查

维护 `gh-skill` 时用 Node.js 22 或更新版本运行下列检查，无需 Python 或 npm 依赖：

```sh
node --test scripts/check-skill.test.mjs pi/context-compaction.test.mjs
node scripts/check-skill.mjs
```

## 快速上手

复制下面的指令到 Pi。涉及 GitHub 的示例，请先把 `OWNER/REPO` 和示例编号换成实际仓库与编号；本地自审不访问 GitHub。

| 任务 | 指令 |
| --- | --- |
| 整理待办 | `/skill:gh-skill 按标签和负责人汇总 GitHub 仓库 OWNER/REPO 未关闭的 Issue，只读` |
| 从 Issue 开 Draft PR | `/skill:gh-skill 实现 GitHub 仓库 OWNER/REPO 的 Issue #12，本地检查通过后在该仓库开 Draft PR，并只读查看 CI，不合并` |
| 提交前自审 | `/skill:gh-skill 按开发清单审查本地改动，指出耦合、重复规则和漏测；只读，不提交` |
| 诊断 PR 的 CI | `/skill:gh-skill 只读检查 GitHub 仓库 OWNER/REPO 的 PR #42 最新提交的 CI；如果失败，汇报失败步骤和关键日志，不重跑` |

[开发与自审清单](references/development.md)随 Skill 一起安装和更新，无需额外配置。通过上面的指令，即使没有 GitHub Issue 或 PR，也能用它审查本地改动。

有关开发习惯、对话主线和项目外资源授权的约定，见[常见问题](references/faq.md)。

整理、诊断和仅审查默认只读。只说「实现 Issue」时，Pi 在本地修改和验证后停下，不自动提交或推送。即使明确要求开 Draft PR，也要先汇报改动和验证结果，得到同意后才能创建或修改提交。未经明确同意，不修改其他仓库或当前项目外的目录。加标签、指派、评论和手动重跑也需要明确授权；合并与生产部署要单独确认。
