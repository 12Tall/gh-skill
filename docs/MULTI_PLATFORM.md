# 多平台兼容：需求与调研记录

当前只保留 GitHub 和 Gitea 预览。以下多平台范围是历史计划，不代表发布承诺；GitLab 及其他平台暂停。

## 范围

- 保留 `/skill:gh-skill` 统一入口和 GitHub 现有行为。首批新增 GitLab.com、官方 Gitea Cloud、临时自建 GitLab 和临时自建 Gitea；Gitee 与 Gogs 不在首版范围。
- 支持从 Issue 到 PR/MR：读取需求、本地实现及自审、验证后推送主题分支、创建草稿、查看最新提交的 CI。只要求实现时不自动提交或推送；合并单独确认。
- 同仓库分支和已有 Fork 都要支持。Fork 流程分别核对推送目标和上游目标，仅使用用户确认的现有 Fork；不代建，也不在同仓库推送失败时擅自切换。
- 实例不支持 Draft 或无法确认支持时，在推送前询问用户要开普通 PR/MR，还是保留本地改动。不得用写操作探测能力。
- 新平台 CI 只读汇报最新提交对应的通过、失败、进行中或尚未看到检查；有运行链接则附上。未看到检查不等于未触发。不纳入失败日志诊断、自动修复或再推送、手动触发、重跑、取消。

## 目标与工具

- 优先使用用户明确指定的实例和仓库，其次是项目默认目标。无默认且多个远端可能匹配时先问，不擅自选择 `origin`；配置的默认目标不等于访问授权。自建实例可在项目配置中明确平台类型和地址。
- 复用目标实例已有认证。缺少认证时提示单独配置；不索取聊天中的 Token，不将凭据写入 Skill 或仓库，不跨实例复用。
- 按平台安装 CLI，不自动安装。GitHub 继续用 `gh`，GitLab 用 `glab`，Gitea 先评估 `tea`；如有能力缺口，再评估平台 API。共同的自审和授权规则只维护一份，平台命令分开维护。

## 验收与发布

- 四种环境分别验收同仓库和已有 Fork 两种流程。没有真实验收的环境标为预览；可先发布已通过的环境，全部实测后再宣布四种环境正式支持。
- 模拟结果不算真实平台通过。访问云实例、搭建临时自建实例、创建或更新真实测试资源前，先确认范围和授权。
- `gitea.com` 已验收同仓库普通 PR，不等同于官方 Gitea Cloud 验收。GitLab 仅做过公开资料调研，不进入实施。

## GitLab 官方资料调研（尚未验收实例）

- [Token 权限](https://docs.gitlab.com/security/tokens/access_token_scopes/)说明 `read_api` 授予 Token 范围内的只读 API 访问；用户、群组和项目 Token 的资源范围不同。
- [`glab api`](https://docs.gitlab.com/cli/api/)可显式指定 `--hostname`；[MR API](https://docs.gitlab.com/api/merge_requests/)提供 MR 当前 head、`head_pipeline` 和 MR 专属 pipeline 列表。用 MR 关联证据核对当前修订，不拿分支的最新 pipeline 代替。
- [Merged results pipeline](https://docs.gitlab.com/ci/pipelines/merged_results_pipelines/)使用临时合并提交，pipeline SHA 可能不等于源分支 SHA。若不能证明该运行属于当前 MR 修订，标记归属未确认，不报通过。

## Gitea 调研与部分验收

- [正式发布版 `tea v0.16.0`](https://gitea.com/gitea/tea/releases/tag/v0.16.0) 的源码确认有 `--head <user>:<branch>`、`--draft` 和 Actions runs 列表。列表有事件、状态等筛选，但没有 `head_sha` 筛选参数；首版验收应确认客户端能按 SHA 匹配，否则使用已确认支持该参数的 Gitea API，不能拿分支最新运行代替。当前机器未找到 `tea`，这只是源码核对，不是命令或实例验收。

- [`tea` 主分支的 PR 创建实现](https://gitea.com/gitea/tea/src/branch/main/cmd/pulls/create.go)支持 `--head <user>:<branch>`，并用 `--draft` 加上 `WIP:` 前缀。按 [Gitea 官方说明](https://docs.gitea.com/usage/pull-request)，服务端用可配置的前缀识别 WIP 并阻止合并；用户接受这种由服务端阻止合并的 WIP 作为草稿；若推送前不能确认实例会识别 `WIP:`，仍须询问，不把标题前缀本身当成草稿。
- [Gitea 1.25 API](https://docs.gitea.com/api/1.25/)支持按提交查询状态、按 `head_sha` 筛选 Actions 运行。仍需验证计划支持的 `tea` 发布版本、官方云实例实际能力，以及 Fork PR 的运行归属和提交匹配。
- 候选实例 `https://gitea.com` 的公开 `/api/v1/version` 和 `/api/v1/settings/repository` 均返回 HTTP 200。版本接口报告 `29.0.0+dev-160-g55186ca39b`；仓库设置响应不暴露 WIP 前缀。未确认该地址是否是用户的 Cloud 工作区。后续只读查询同实例官方 `gitea/runner` 仓库的公开 PR [#1246](https://gitea.com/gitea/runner/pulls/1246) 和 [#1210](https://gitea.com/gitea/runner/pulls/1210)：两者均以 `WIP:` 开头，API 返回 `draft: true` 与 `mergeable: false`。结合官方文档，这是 `gitea.com` 识别 `WIP:` 的实例证据；专用测试仓库的同仓库草稿 PR #2 已用 `tea --draft` 创建，API 回读为 `draft: true`、`mergeable: false`；未尝试合并。
