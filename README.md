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

从目标项目启动 `pi`（不需要 `--skill`）。先用 `/skill:gh-skill 只读查看当前仓库和默认分支` 验证加载，再试试：

- `/skill:gh-skill 看看当前仓库有什么未关闭的 Issue`
- `/skill:gh-skill 排查 PR #42 的失败检查，只读，不重跑`
- `/skill:gh-skill 根据 Issue #12 给出实现计划，先不要改代码`

## 开发流程

从 Issue 理解需求，确认范围，修改并本地验证，再按请求推送分支、创建 PR 和检查 CI。默认先诊断，不擅自修改远程状态。

[Intentional CI probe](references/intentional-missing-file.md)
