# 只读子 Agent：文件访问层

主线第一阶段的基础模块：`pi/read-only-workspace.mjs`。现已由[受限 SDK 会话](READ_ONLY_SESSION.md)封装为自定义工具，并已接入[子进程管理器](READ_ONLY_MANAGER.md)；不改变全局包清单，不自动加载扩展。文件访问层本身不调用模型。旧 `subagent-probe.mjs` 仍使用 Pi 原生只读工具，没有自动获得这里的限制。

## 接口与授权

```js
import { createReadOnlyWorkspace } from '../pi/read-only-workspace.mjs';

// root 必须由主 Agent 按用户批准的范围提供，不能让子 Agent 随意选择。
const workspace = createReadOnlyWorkspace('/approved/project', {
  exclude: ['private-data'],
  limits: { fileBytes: 128 * 1024 },
});
workspace.read('src/main.js');
workspace.list('src');
workspace.search('literal text', { directory: 'src' });
```

- `read` 返回 `{ path, text, bytes }`；仅接受普通 UTF-8 文本，拒绝 NUL、无效 UTF-8 和可识别的私钥标头。
- `list` 递归返回 `{ files, skipped }`，只列允许的普通文件。
- `search` 是大小写敏感的字面量搜索，不运行正则、Shell 或外部搜索程序；返回 `{ matches: [{ path, line, text }], scannedBytes, skipped }`，行号从 1 开始。
- 三种入口共用路径检查；只接受相对路径，目录根用 `.`，拒绝绝对路径、`..`、反斜杠、空分段等歧义输入。
- 默认拒绝所有符号链接（包括项目内部链接）、多硬链接文件和非普通文件；根目录必须没有符号链接路径，根身份发生变化后拒绝继续访问。
- 默认排除 `.env` 及其变体、常见私钥/凭据名，以及 `.git`、`.pi`、`.ssh`、`.aws`、`.local-tools`、`node_modules` 等目录；完整规则以模块为准。`exclude` 只能追加限制，构造后修改原数组不会放宽权限。
- 直接读取受限文件会报错；遍历遇到被排除的条目会跳过并增加计数。搜索还会跳过二进制、私钥内容和超过单文件上限的文件。无法完成扫描时显式报错，不能将超预算视为空结果或完整搜索。

## 默认预算

| 项目 | 上限 |
| --- | --- |
| 单文件读取 | 256 KiB |
| 单次搜索扫描内容 | 4 MiB |
| 遍历目录条目（含跳过项） | 2000 |
| 搜索匹配 | 100 |
| 单次返回 JSON | 64 KiB |
| 搜索词 | 1024 字节 |

调用者可以降低预算，不能提高默认上限。读取文件增长时仍只读取至上限加一字节用于检测；超限抛出明确错误，不静默截断。

## 测试与边界

```sh
node --test scripts/read-only-workspace.test.mjs
node --test scripts/*.test.mjs pi/context-compaction.test.mjs
node scripts/check-skill.mjs
```

测试在本仓库内创建一次性夹具并清理；覆盖正常读取与证据、遍历路径、敏感文件、搜索绕过、内外部符号链接、硬链接、根替换、内容过滤、预算、错误和预取消。测试不访问模型或远端服务。

这是**工具层边界，不是操作系统沙箱**：

- 文件名规则和私钥标头检测无法识别任意文件里的密码或 Token。授权目录应先排除敏感内容；不能据此承诺自动脱敏。
- `lstat`、根身份检查和 `O_NOFOLLOW` 防止静态链接绕过，但 Node 路径 API 不能完全消除恶意进程并发替换祖先目录的 TOCTOU 竞态，也不隔离挂载点。只用于可信、无恶意并发修改的工作区；更强对抗需要 OS 隔离或受控快照方案。
- 当前实现同步执行，`AbortSignal` 只支持调用前及循环检查，不保证能在阻塞文件系统调用中及时取消。进程级超时、取消和强制终止由外层管理器提供，不是本模块自身的能力。
- `read` 的文件上限与返回上限分别生效；文件可读取并不保证整个返回 JSON 能装下，超出返回上限时会报错。
- 不支持 `O_NOFOLLOW` 的平台在读取时拒绝执行；当前实测环境为 Linux。其他平台尚未验证。

SDK 自定义工具、资源发现隔离及单任务子进程管理已实现并完成本地集成检查。项目内[终端确认与独立复核流程](READ_ONLY_WORKFLOW.md)也已提供。完整链路已完成获授权的 3 个真实模型场景，记录见工作流文档。当前能力仍限于已验证范围，每项扩展均需独立测试，不把本模块通过当作任意任务都正确或完整安全隔离的证明。
