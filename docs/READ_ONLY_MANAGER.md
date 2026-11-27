# 只读子 Agent：子进程管理与执行检查

`pi/read-only-manager.mjs` 是可信宿主 API，启动 `pi/read-only-worker.mjs`；worker 创建[受限 SDK 会话](READ_ONLY_SESSION.md)，通过 `pi/read-only-task.mjs` 检查完成状态。当前支持 Linux，其他平台明确拒绝启动。

## 授权与使用

```js
import { createReadOnlyTaskManager } from '../pi/read-only-manager.mjs';
const manager = createReadOnlyTaskManager({ timeoutMs: 120_000 });
const controller = new AbortController();
// 以下值必须来自可信宿主，并先向用户说明任务、目录、验收条件和模型服务。
const result = await manager.run({
  root: '/approved/project',
  sdkPackage: '/approved/pi-coding-agent',
  authPath: '/approved/auth.json',
  provider: 'approved-provider',
  model: 'approved-model',
  task: '审查指定目录，禁止修改',
  acceptance: '给出有文件位置依据的发现及未验证项',
  exclude: ['private-data'],
}, { approved: true, signal: controller.signal });
// 另一个宿主事件处理器可调用 controller.abort() 取消任务。
```

**尚无交互式确认 UI。** `approved` 是宿主根据真实用户授权传入的门槛，不是授权凭证；不得让模型自己填写它。构造参数中的 worker 路径也是可信宿主配置，只用于管理器和测试，不能暴露为模型工具参数。任务发起后复制配置，后续修改原对象不会更改该次请求。

实际运行会读取显式授权的 SDK 和凭据，并调用指定模型服务；凭据刷新可能写回指定的 auth 文件。默认只使用 SDK 内置模型目录，不读取用户 `models.json`，不启用自动目录联网刷新；尚不支持自定义模型配置或继承环境变量凭据。`PI_OFFLINE=1` 不阻止获授权的模型请求。

## 生命周期

- 同一管理器仅允许一个运行中任务；忙时返回 `BUSY`，**不隐式排队或重试**。
- `getState()` 返回 `idle`、`running` 或 `stopping`。只有子进程关闭后才释放任务槽位。
- 默认总超时 120 秒，可设为 1–300000 毫秒；超时返回 `timed_out/TIMEOUT`。
- 取消或超时先向独立进程组发送 SIGTERM，默认 1 秒宽限期后 SIGKILL；退出时清理同组残留进程。
- 子进程仅继承最小环境，不继承 NODE_OPTIONS、扩展设置或凭据环境变量；输入通过 stdin 传递，不拼接 Shell。
- stdout 必须为单个结果 JSON；stdout 与 stderr 合计默认上限 64 KiB（可设至最多 128 KiB），超限终止并报错。原始 stderr 不自动返回用户，避免泄露凭据或主机信息。
- 非零退出、异常协议、伪造 `verified: true`、证据包含未开放工具等不能报告成功。

## 执行结果

```text
{
  status: completed | failed | cancelled | timed_out,
  code: 错误代码或 null,
  summary: 最终摘要（失败时可能为空）,
  evidence: [{ tool, path, ok }],
  verified: false
}
```

`completed` 只表示**执行检查通过**，不表示满足用户的语义验收条件。主 Agent 仍须核对摘要、文件位置、检查证据和未验证项。证据记录来自 SDK 工具事件，不采用模型自报的“工具已执行”；当前证据仅包含工具、路径及成功标记，不替代内容核验。

任务执行器要求正常 `agent_settled`、最终 assistant stop 状态、非空摘要及配对工具事件。模型错误、截断输出、工具失败、缺失结束事件均失败。遇到工具失败或未开放工具会请求中止，不自动改道访问。摘要限制 32 KiB，证据最多 128 条，最多 16 轮；worker 最终记录也受大小限制。

## 本地验证

```sh
node --test scripts/*.test.mjs pi/context-compaction.test.mjs
node scripts/check-read-only-sdk.mjs /path/to/installed/pi-coding-agent
node scripts/check-skill.mjs
```

已执行的验证层次：

1. 真实本地子进程夹具：正常退出、UTF-8 分块、非零退出、非法 JSON、伪造验证状态、stdout/stderr 超限、抵抗 SIGTERM 的父子进程组、超时、取消、并发拒绝、启动失败及任务槽位复用。
2. 任务执行器单元测试：工具证据配对、错误/截断/空输出/缺失结束事件不冒充成功，未知工具和轮次超限触发中止，启动失败与预取消清理。
3. 真实 Pi 1.6.1 SDK + 脚本化模型后端：实际工具调用与模型错误识别；通过测试用 SDK 适配模块，将真实生产管理器、worker、SDK 全链路连通。适配模块只替换模型运行时，不访问真实凭据或模型服务。

补测曾发现：仅在工具结束事件中调用 SDK abort，仍可能进入下一次模型分派；提前到工具失败回调也不足以单独保证停止。现由兼容的可选 `onToolFailure` 回调立即标记失败，再在模型运行时分派前检查停止状态，阻止后续请求进入模型后端。真实 SDK 回归检查断言拒绝读取后后端只收到一次请求，已通过；未放宽断言。

这不是接入后的真实模型行为测试。测试夹具与适配模块都位于项目内并在结束后清理，不全局安装。

## 限制与下一步

- 进程组管理不是 OS 沙箱，无法抵抗同权限恶意进程、主动脱离进程组的进程或不可中断内核 I/O；文件访问层的并发路径替换及敏感内容识别限制仍然存在。
- 资源预算不是 CPU/RAM/cgroup 限制；同步文件系统操作靠外层进程终止兜底，不保证所有环境均能立即终止。
- OAuth 凭据刷新结束时会等待写入；若强制终止发生在写入期间，需要后续核验登录状态，不宣称凭据绝不受影响。
- 尚需接入委派前确认和状态展示，完善主 Agent 的语义验收流程，执行获授权的真实模型场景测试。当前不全局安装、不支持并行或写入任务。
