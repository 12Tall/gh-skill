# gh-skill

主要给 **Pi coding agent** 使用的 Skill，推荐全局安装，在所有项目中使用。它把 Git、平台 CLI 和提交前自审串起来：先用工具核验事实，再根据结果决定下一步（ReAct）。适合整理 Issue、从需求开发到开 PR、排查 CI，以及不联网的本地代码审查。

| 场景 | 用途与范围 |
| --- | --- |
| 本地 Git | 看 diff、查历史、按开发清单审查改动；不需要平台 Token。提交和推送遵守授权规则。 |
| GitHub | 用 `gh` 处理仓库、Issue、PR 和 Actions，包括查询、日志诊断及明确授权的运行操作。 |
| Gitea | 预览：用 `tea` 查询，已在 `gitea.com` 验证同仓库普通和草稿 PR；也可用 SSH 推送后在网页操作。 |
| GitLab.com | 有限只读预览：用 `glab` 查询 Issue、MR 和流水线。同仓库 Draft MR 已单独实测，未启用自动写入。 |

## 全局安装（推荐，默认启用自动压缩）

需要 **Pi 和 Git**。本仓库公开，安装不需要 GitHub 登录；只有执行具体平台操作时，才需要相应的 CLI 和授权，见[认证指南](references/authentication.md)。

审阅本仓库的扩展代码后，在任意目录执行（不加 `--local`）：

```sh
pi install git:github.com/12Tall/gh-skill
```

重启 Pi 或执行 `/reload`。Pi 会在用户级加载 Skill 和压缩扩展，不需要 npm 发布或额外创建符号链接。扩展在每轮结束时检查当前模型的上下文用量，达到约 60% 时请求压缩；如果你在 Pi 里关闭了自动压缩，扩展不会触发，也不会改写你的设置。只想保留 Skill 时，可在 `pi config` 禁用该包的压缩扩展。

这里的「全局」指当前用户的所有 Pi 项目，不是系统所有用户；配置保存在 `~/.pi/agent/settings.json`，无需 `sudo`。

### 验证与首次使用

运行 `pi list` 确认已配置该包，然后在任意工作项目启动 Pi（已有会话先执行 `/reload`），输入：

```text
/skill:gh-skill 只读审查本地改动，不访问 GitHub
```

无需在每个项目克隆 Skill，也无需传 `--skill`。更多任务示例见下方「快速上手」。

### 更新 Skill（全局安装）

仓库发布新改动后，在**终端的任意目录**执行，无需重新克隆或卸载：

```sh
# 查看已配置的包，确认 gh-skill 的安装来源
pi list

# 只更新 gh-skill（需要联网）
pi update git:github.com/12Tall/gh-skill
```

命令成功后，在正在运行的 **Pi 会话内**输入：

```text
/reload
```

也可以退出并重新启动 Pi。所有使用该全局包的项目都会在下次加载时使用更新后的 Skill、参考资料和扩展；其他已打开的会话也需要分别重载。可输入 `/skill:gh-skill 只读审查本地改动，不访问 GitHub` 验证仍可调用。

- 按上方不带版本的命令安装时，更新跟随仓库默认分支；本仓库为 `master`。
- 若安装来源固定了标签或提交，更新不会自动切换到新版本。要升级，先选定实际存在的新标签或提交，再用 `pi install git:github.com/12Tall/gh-skill@<新标签或提交>` 更换固定版本（替换占位符），然后重载。
- 若更新报错，不要视为更新成功；排查网络或 Git 错误后重试。`/reload` 不能替代一次成功的包更新。
- 不要用不带参数的 `pi update` 更新 Skill：它更新的是 **Pi 本身**。`pi update --extensions` 会更新所有已安装的 Pi 包，不只本 Skill。
- 手动克隆到项目的安装方式不使用上述包更新命令，见下方「备选：手动安装到指定 Pi 项目」的 `git pull --ff-only` 说明。

### 卸载

```sh
pi remove git:github.com/12Tall/gh-skill
```

卸载后重载或重启 Pi；如果添加过下方的自审指引，也应移除对应指引。

全局安装和下文的手动项目安装选一种即可。切换到全局方式前，检查并移除目标项目里旧的 `.agents/skills/gh-skill` 副本和 `.pi/extensions/gh-skill-context-compaction.js` 链接，避免重复加载；有本地修改时先保留。旧 `AGENTS.md` 中硬编码项目安装路径的指引，也应换成下方不依赖安装路径的版本。

## 默认提交前自审（全局或单项目）

安装后可以显式调用 `/skill:gh-skill`，但安装本身不能保证模型在你只说「请提交」时自动选用它。若希望所有项目默认启用，将下面一段追加到 `~/.pi/agent/AGENTS.md`；只约束某个项目时，追加到该项目根目录的 `AGENTS.md`。文件不存在时创建，不覆盖已有内容，修改后重启 Pi。

```text
启用 gh-skill：每次由 Pi 创建 Git 提交前（包括 amend），必须先读取已安装的 gh-skill 的 SKILL.md，并按其所在目录读取 references/development.md，审查将要提交的 diff 并运行相关检查；有实质问题或验证受阻时先停下汇报，不要提交。先汇报改动与验证结果，再取得明确提交授权；自审不等于提交授权。
```

该指引不依赖包的缓存路径，适用于全局和项目安装。这是对 Pi 的约束，不是 Git hook，不拦截你在终端手动执行的 `git commit`。

## 备选：手动安装到指定 Pi 项目

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

默认提交前自审使用上方相同的 `AGENTS.md` 指引。若不想共享项目级配置，不要暂存该文件的改动。

### 手动项目安装可选：约 60% 时自动压缩

全局包安装已经加载此扩展，不要再创建下面的链接。

在**已信任的目标项目**根目录执行以下命令，为该项目显式启用随 Skill 提供的 Pi 扩展，然后重启 Pi。仅克隆 Skill 不会加载扩展。扩展具有 Pi 进程的权限，请先审阅代码。

```sh
mkdir -p .pi/extensions
ln -s ../../.agents/skills/gh-skill/pi/context-compaction.js .pi/extensions/gh-skill-context-compaction.js
```

扩展在一轮工作完成后按**当前模型**的上下文窗口检查估算用量，达到约 60% 时请求压缩。同一轮超阈值状态不会反复请求。如果 Pi 已禁用自动压缩，扩展也不会触发。它不改全局设置，也不替换 Pi 原生的溢出恢复或自动压缩；因此不是每个 token 都检查的硬阈值。只想本地启用时，不要提交该链接；关闭时移除该链接并重启 Pi。

## 执行方式：逐步确认与 Subagent 约束

默认由主 Agent 按「方案 → 修改 → 验证 → 提交 → push」推进，但不机械地逐阶段追问。明确、范围有限的任务自动整理并执行，相关验证默认包含在授权中；目标不清、范围扩大或优先级冲突时才逐步问清。提交、push、委派、项目外访问和高风险操作仍遵守各自授权规则。如果你明确要求「每一步都确认」，则按更严格的模式执行。你可以明确授权连续几个阶段，例如「按方案修改并运行本地检查」；已授权且范围未变的步骤不重复询问。仅审查时跳过修改、提交和 push。简短的「OK」只确认紧接着的具体提议，不代表后续所有操作都获授权。

新要求会先区分咨询、执行任务和长期约束：当前核心目标归入主线，独立事项放入简短支线清单，长期规则单独记录。讨论不会自动变成修改任务；打断主线前确认优先级，明确要求切换则直接按要求调整。只在任务切换、遇阻和收尾时汇报进度，说明主线停在哪里、下一步是什么，不默认创建任务文件。详见[轻量需求整理规则](references/development.md#lightweight-task-intake)。

需要 subagent 时，主 Agent 必须先说明任务划分、读写范围和预期结果，并征得同意：

- 子任务继承现有授权边界，不得访问未授权资源或自行扩大范围。
- 子 Agent 不得自行提交、push、合并、部署、修改凭据或权限，也不得继续委派。
- 并行修改须分配互不重叠的文件；遇到冲突、缺失前提或范围变化时停止并汇报。
- 主 Agent 负责检查返回的改动和证据、验证结果，不把子 Agent 的「完成」直接当作验证通过。

**所有任务默认验证**：无论主线、支线还是临时安排，都要执行与验收目标相关的检查，除非你明确要求跳过。文档或规则变更也不例外；既有测试通过不代表新增行为已验证。缺少工具、环境或权限时，应完成可执行的检查并明确报告未验证项，不能宣称通过。验证涉及未授权外部访问或破坏性操作时，仍须先取得对应授权。

本 Skill **不安装或提供 subagent 工具**，这些约束也不是权限沙箱。环境没有该能力时，说明限制并回到主 Agent 逐步确认，不自动安装扩展。

示例：`/skill:gh-skill 先提出修改方案，每一步找我确认，不使用 subagent`。也可以要求「先提出 subagent 分工和授权范围，等我确认再委派」。每项修改任务结束后，Agent 应汇报检查结果，并明确提醒是否提交、是否 push；两者可以一起授权，但不能由其中一个推定另一个。

## 默认推进规则

- 每个问题和子问题都用 ReAct / PDCA：明确目标、检查证据、修正复验，直到得到限定范围内的可靠结论，或明确未解决/受阻及所缺条件；不无限重试。
- 能在 Actions 完成的测试、构建和静态检查优先放到 Actions。本地只做必要预检查、无法迁移的交互/本机环境验证或最小排障，不上传本机模型凭据。见 [Actions 优先策略](references/actions.md#actions-first-execution)。
- 对当前授权任务中创建或明确交由主 Agent 负责的非 Draft PR，最新检查和必需审批均通过、无冲突/未解决问题且合并方式明确时默认合并；只读/不合并要求优先，生产部署仍需授权。见[完整合并门槛](references/merging.md)。

## 本仓库的开发检查

正式验证优先由 `.github/workflows/skill-check.yml` 在 push 到 `master` 或 PR 时执行：Node.js 22 单元/回归检查、固定 Pi 1.6.1 的脚本化 SDK 集成和伪终端检查。workflow 只保留 Contents 读取权限，不调用真实模型。配置存在不代表远端已经通过，须核对实际提交及运行结果。

下列是 runner 使用的基础命令，也供必要的最小本地复现使用，无需 Python 或 npm 依赖：

```sh
node --test scripts/*.test.mjs pi/context-compaction.test.mjs
node scripts/check-skill.mjs
```

项目内只读子进程探针、真实模型测试步骤和验证边界见 [Subagent 测试说明](docs/SUBAGENT_TESTING.md)。普通单元测试不会调用模型。

正在完善的只读子 Agent 已有[文件访问层](docs/READ_ONLY_WORKSPACE.md)、[受限 SDK 会话](docs/READ_ONLY_SESSION.md)、[单任务子进程管理器](docs/READ_ONLY_MANAGER.md)及[终端确认与独立复核入口](docs/READ_ONLY_WORKFLOW.md)：限制文件访问、支持超时/取消，真人确认后运行，并将执行完成与主 Agent 验收分开。已通过本地子进程、真实 SDK（脚本化模型响应）及伪终端测试，不调用外部模型。已完成授权的 3 个真实模型场景及主 Agent 独立核验，见[实测记录](docs/READ_ONLY_WORKFLOW.md#真实模型验证记录)。当前不全局安装、不注册 Pi 原生命令，也不会自动替换旧探针。

## 快速上手

复制下面的指令到 Pi。涉及 GitHub 的示例，请先把 `OWNER/REPO` 和示例编号换成实际仓库与编号；本地自审不访问 GitHub。

| 任务 | 指令 |
| --- | --- |
| 整理待办 | `/skill:gh-skill 按标签和负责人汇总 GitHub 仓库 OWNER/REPO 未关闭的 Issue，只读` |
| 从 Issue 开 Draft PR | `/skill:gh-skill 实现 GitHub 仓库 OWNER/REPO 的 Issue #12，必要预检查后在该仓库开 Draft PR，并在 Actions 验证及只读查看 CI，不合并` |
| 提交前自审 | `/skill:gh-skill 按开发清单审查本地改动，指出耦合、重复规则和漏测；只读，不提交` |
| 诊断 PR 的 CI | `/skill:gh-skill 只读检查 GitHub 仓库 OWNER/REPO 的 PR #42 最新提交的 CI；如果失败，汇报失败步骤和关键日志，不重跑` |

[开发与自审清单](references/development.md)随 Skill 一起安装和更新，无需额外配置。通过上面的指令，即使没有 GitHub Issue 或 PR，也能用它审查本地改动。

有关开发习惯、对话主线和项目外资源授权的约定，见[常见问题](references/faq.md)。

整理、诊断和仅审查默认只读。只说「实现 Issue」时，Pi 在本地修改和验证后停下，不自动提交或推送。即使明确要求开 Draft PR，也要先汇报改动和验证结果，得到同意后才能创建或修改提交。未经明确同意，不修改其他仓库或当前项目外的目录。加标签、指派、评论和手动重跑也需要明确授权；符合默认合并门槛的任务内 PR 不再重复询问是否合并，生产部署和其他高风险例外仍须单独确认。
