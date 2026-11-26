# gh-skill

给 Pi 使用的 GitHub CLI Skill。第一版覆盖仓库、Issue、PR，以及 GitHub Actions 的查询、日志排查、手动触发、失败重跑和取消。

## 本地试用

需要 Git、已登录的 `gh`，以及对目标仓库的权限。在要操作的项目目录启动 Pi：

```sh
pi --skill "$HOME/gh-skill/SKILL.md"
```

然后试试：

- `/skill:gh-skill 看看当前仓库有什么未关闭的 Issue`
- `/skill:gh-skill 排查 PR #42 的失败检查，只读，不重跑`
- `/skill:gh-skill 根据 Issue #12 给出实现计划，先不要改代码`

## 开发流程

从 Issue 理解需求，确认范围，修改并本地验证，再按请求推送分支、创建 PR 和检查 CI。默认先诊断，不擅自修改远程状态。
