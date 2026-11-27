# 只读子 Agent：受限 SDK 会话

`pi/read-only-session.mjs` 将[文件访问层](READ_ONLY_WORKSPACE.md)接入 Pi SDK。此模块不注册全局扩展，不提供用户界面，也不自动启动子进程；当前是后续管理器调用的可信宿主 API。

## 配置

宿主显式提供已安装 Pi 的 SDK、TypeBox、已授权模型及其 ModelRuntime：

```js
import * as sdk from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createReadOnlySession } from '../pi/read-only-session.mjs';

// root、modelRuntime、model 由可信宿主在授权后提供。
const session = await createReadOnlySession({ sdk, Type, root, modelRuntime, model });
try {
  // task 也必须在授权范围内。此调用会使用 modelRuntime 请求模型服务。
  await session.prompt(task);
  console.log(session.getLastAssistantText());
} finally {
  session.dispose();
}
```

模块不自动查找或创建凭据、不选择默认模型。SDK/TypeBox 由宿主注入，项目不额外安装或打包一份 Pi。单元测试使用替身，独立集成检查使用真实安装包。

## 工具与隔离配置

- 仅启用 `workspace_read`、`workspace_list`、`workspace_search`；它们调用同一文件访问层，不开放原生 read、Bash、写入、MCP、codemode 或委派工具。
- 根目录、额外排除和预算在宿主构造时确定，不出现在模型工具参数里；参数禁止额外字段，适配器也进行检查。
- 文件系统错误只返回错误代码，不将原始 OS 错误里的绝对路径或堆栈放入工具消息。
- 空资源加载器阻止项目和全局扩展、Skill、模板、主题和 AGENTS.md 自动发现，系统规则由模块明确给定。
- 会话与设置使用内存实现；关闭压缩、缓存预热、Agent 级与 provider 级自动重试。
- 创建后核对实际激活工具名单，不符则释放会话并报错。

文件工具支持继承 AbortSignal，但不因此获得强制取消能力。SDK 返回的会话对象是**可信宿主接口**，不得暴露给模型生成的代码；宿主自身仍能执行高权限操作。本层不负责取得用户授权，未来委派管理器必须先核对任务、可读范围和验收条件，再创建并调用会话。

## 验证

无需 Pi 依赖的单元测试：

```sh
node --test scripts/*.test.mjs pi/context-compaction.test.mjs
node scripts/check-skill.mjs
```

真实 SDK 集成检查（将占位路径替换为已安装包目录）：

```sh
node scripts/check-read-only-sdk.mjs /path/to/installed/pi-coding-agent
```

该命令读取指定的本地 SDK 和其 TypeBox，创建并清理本项目内的临时夹具，不安装依赖、不读取模型凭据、不调用模型服务。模型响应由测试脚本生成，实际工具验证和调用由真实 SDK 执行。

本机 Pi 1.6.1 已验证：

- 只有三个受限工具被声明及激活；读取、列表和搜索成功。
- `.env`、`..` 越界、符号链接读取及未开放的 Bash 调用失败。
- 项目中植入的扩展、设置及上下文不加载，夹具不被修改。
- 模拟 503 错误只调用一次模型后端，不自动重试。SDK 的 `prompt()` 可能在消息记录为 error 时仍正常返回，因此未来管理器必须检查结束状态和消息，不能仅凭 Promise resolve 宣称任务成功。

集成检查最初遇到 SDK 仅导出 ESM、模型上下文使用系统消息承载工具定义两处适配问题；检查脚本已按实际接口修正并通过。以上不等于真实模型行为测试，也不验证文件访问层已声明不覆盖的 OS/并发竞态。

## 尚未完成

- 独立子进程、单任务串行队列、超时、取消、强制终止及清理。
- 委派前的用户确认和状态展示。
- 对模型最终结果、结束事件及证据的统一验收和输出预算。
- 接入后的真实模型场景测试。

旧 `subagent-probe.mjs` 仍未切换到本模块，不能把其原生工具当作具有这些访问限制。生产使用前应先完成进程和验收管理，不把当前内存 SDK 会话当作完整安全沙箱。
