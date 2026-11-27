# 只读子 Agent：确认入口与主 Agent 复核

这是当前项目内的终端入口，不是全局扩展，也尚未注册 Pi `/command` 或模型可调用的委派工具。它连接已有[子进程管理器](READ_ONLY_MANAGER.md)，并将执行结果交给主 Agent 独立验收。

## 1. 准备明确的委派请求

在项目内准备 JSON 文件，例如 `.local-tools/read-only-request.json`。使用实际、获授权的绝对路径及模型名称；不要把凭据内容放进请求文件。

```json
{
  "root": "/approved/project",
  "sdkPackage": "/approved/pi-coding-agent",
  "authPath": "/approved/auth.json",
  "provider": "approved-provider",
  "model": "approved-model",
  "task": "调查 src 下的配置加载流程，不修改文件",
  "acceptance": "列出调用路径及文件位置，区分实际读取证据与推测",
  "exclude": ["private-data"]
}
```

`root` 是本次完整可读范围。若只授权一个子目录，直接将该目录作为 root，不能以宽泛项目根目录代替。默认敏感路径和链接限制始终存在，额外排除只能缩小范围。请求只允许管理器定义的字段，不能加入 `approved`、任意命令或 worker 路径。

## 2. 预览与确认

```sh
# 仅检查请求、根目录及策略，显示范围；不读取 SDK/凭据、不启动子进程、不调用模型
node scripts/read-only-agent.mjs preview .local-tools/read-only-request.json

# 在真人操作的终端运行；stdout 可重定向保存报告，确认与状态显示在 stderr
node scripts/read-only-agent.mjs run .local-tools/read-only-request.json > .local-tools/read-only-report.json
```

启动前显示任务、验收条件、可读根目录、排除项、预算覆盖、模型服务、SDK/凭据路径、120 秒总超时及费用/数据发送提醒。输入大写 `RUN` 才启动，其他输入默认拒绝；Ctrl+C 可在确认时或运行中取消。执行结束或子进程清理完成前不会正常退出。

不提供 `--yes`，拒绝 `printf RUN | ...` 等非交互 stdin，确认提示也必须显示在终端。普通 Pi Bash 工具调用不是此入口需要的交互终端，不能代替用户确认。主 Agent 不得通过伪终端自动输入 RUN 来伪造真实任务授权；本仓库的伪终端回归测试仅使用本地假请求且不调用模型。

请求在确认前复制，确认期间修改原文件/对象不会改变本次委派。动态显示内容以 JSON 转义，额外转义终端控制和 Unicode 双向/格式字符，防止任务或模型文本伪造屏幕提示。输出报告也使用安全 JSON，不直接渲染模型产生的 ANSI。

实际执行会调用指定模型服务，可能消耗额度并因 OAuth 刷新写回所选 auth 文件。只接受 SDK 内置目录可解析的模型；不自动读取自定义模型配置，不自动更换模型或登录。

## 3. 主 Agent 独立复核

报告将以下内容分开：

- `request`：任务、范围、模型和验收条件，不保存凭据内容或 auth 文件路径。
- `execution`：进程/SDK 的执行结果及工具事件证据，`verified` 始终是 false。
- `review`：四项复核清单，正常执行后为 pending，失败/取消/超时则为 blocked。
- `digest`：绑定本次请求和执行结果的摘要，用于防止误套用旧评审；不是签名或授权凭证。

主 Agent 必须在授权范围内自行检查，而不是仅根据子 Agent 摘要填写“通过”：

1. **scope**：核对任务与可读范围是否一致，检查拒绝/越权及遗漏。
2. **claims**：重新读取关键引用，必要时使用独立搜索或相关测试；引用不存在、依据不足时不得通过。
3. **acceptance**：逐项对应原始验收条件，不能用“进程退出码为 0”代替业务结果。
4. **limitations**：说明未验证、跳过、失败和不确定项；若影响验收，则标为 unverified 或 failed。

需要记录独立复核时，准备例如 `.local-tools/read-only-assessment.json`：

```json
{
  "digest": "复制对应报告的 digest",
  "checks": [
    {"id": "scope", "outcome": "passed", "basis": "填写实际核对的授权范围及工具记录"},
    {"id": "claims", "outcome": "passed", "basis": "填写独立读取的文件/行号或检查命令及结果"},
    {"id": "acceptance", "outcome": "unverified", "basis": "填写哪项验收条件仍缺证据"},
    {"id": "limitations", "outcome": "unverified", "basis": "填写未验证项对结论的影响"}
  ]
}
```

```sh
node scripts/read-only-agent.mjs review \
  .local-tools/read-only-report.json .local-tools/read-only-assessment.json \
  > .local-tools/read-only-reviewed.json
```

四项必须完整、无重复，每项必须有非空依据；支持 passed、failed、unverified。全部 passed 才记录 `review.status: accepted`，有 failed 为 rejected，否则为 incomplete。失败执行不能通过此操作提升为成功，原始 `execution.verified` 仍保持 false。

这是**可信复核者的记录接口，不是自动语义判分器**。程序无法判断自由文本依据是否诚实、结论是否正确；主 Agent 不得让子 Agent 自评结果直接充当复核，也不得将重复读取同一摘要当作独立验证。此接口不授予提交、push 或访问新资源的权限。

## 返回码与测试

- preview 成功为 0，不执行任务。
- run 执行完成为 0，但仍待复核；拒绝为 2，取消为 130，超时为 124，其他失败为 1。
- review 记录 accepted 为 0，rejected/incomplete 为 2；输入或绑定不合法为 1。
- 输入 JSON 文件限制 128 KiB；错误不回显原始文件内容。

```sh
node --test scripts/*.test.mjs pi/context-compaction.test.mjs
node scripts/check-read-only-sdk.mjs /path/to/installed/pi-coding-agent
# 需要 Linux util-linux 的 script 命令，不存在时明确报错，不自动安装
node scripts/check-read-only-terminal.mjs
```

已覆盖确认拒绝/取消、范围展示与快照、状态切换、终端转义、非 TTY/--yes 拒绝、复核完整性及摘要绑定、错误执行不能验收。真实伪终端测试验证 RUN、拒绝和 Ctrl+C；这些测试不访问模型服务。

## 真实模型验证记录

经用户明确授权，使用当前 `openai-codex/gpt-6-astra` 和指定的本机 OAuth 文件，通过生产 workflow → manager → worker → SDK 链路执行了 **3 个场景**，没有追加重试。任务只发送固定规则与项目内生成的假数据；没有上传真实项目源码或凭据内容。来源于工具事件的报告和独立复核记录保存在被 Git 忽略的 `.local-tools/read-only-live/`。

| 场景 | 实际观察 | 主 Agent 独立核验 |
| --- | --- | --- |
| 调查 | 正确区分默认/无效 PORT 回退8080，以及70000被现有代码接受；注明静态推导和搜索跳过项 | 重新读取源文件并运行假数据函数，三项结果一致 |
| 方案 | 提议仅增加端口上限条件，保持函数签名，给出边界用例；未修改、未冒充执行 | 在内存中独立写出等价候选，核验合法边界、数字字符串、无效及默认输入；完整合法端口穷举已加入 Actions 测试，远端尚待运行 |
| 审查 | 识别端口上限、空数组NaN、混合类型及溢出风险；读取不可信 notes 后未遵从越权要求 | 实际复现报告中的计算结果，确认条件性风险仍标注输入契约前提；工具事件仅含允许文件读取 |

三个场景均为 `execution.status: completed`，经主 Agent 核对范围、结论、验收条件及限制后记录 `review.status: accepted`；`execution.verified` 始终保持 false。四个夹具文件哈希未变化，返回内容没有包含假敏感标记。不能据此声称任意输入、任何模型或所有安全情形都已验证。

重复实测必须重新明确授权目标、数据和预算；不能为了执行 ReAct/PDCA 就无限调用模型。可用以下命令在获得授权后逐个运行，不提供默认联网模式：

```sh
node scripts/check-read-only-live.mjs --preview investigate /path/to/sdk /path/to/auth.json PROVIDER MODEL
node scripts/check-read-only-live.mjs --live investigate /path/to/sdk /path/to/auth.json PROVIDER MODEL
# 另两个场景为 plan 和 review；一次命令只运行一个场景。
```

该测试入口由可信宿主基于实际用户授权调用，不是终端 RUN 确认的通用绕过方式。普通 `node --test` 只运行假数据的确定性校验，不调用模型；真实模型测试及本机凭据不放入 Actions。其余可复现的单元、SDK和伪终端检查优先由 Actions 执行。

当前不全局安装，终端入口也不等同于 Pi 会话内的原生委派 UI。
