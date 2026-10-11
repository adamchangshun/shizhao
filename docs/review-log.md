# 跨模型审查记录（Codex）

记录每个模块的 Codex 只读审查结果、处理方式，以及未修复项的理由。

## 01 脚手架与核心契约

### 第 1 轮（`cdx-review --security`，gpt-5.6-sol / xhigh）：5 HIGH，4 MEDIUM

| 级别 | 问题 | 处理 |
|---|---|---|
| HIGH | 登录限流检查放在 `await request.json()` 之前，并发请求能绕过计数 | 已修复：先解析请求体，再用同步的 `checkAdminToken()` 一次完成“检查 + 失败计数”；新增 50 个并发猜测的测试 |
| HIGH | 限流信任可伪造的 `X-Forwarded-For`，Map 没有上限 | 已修复：改为全局失败预算（15 分钟内 30 次），不再读取客户端地址；Bearer 请求头也计入同一预算（核实时发现 Bearer 方式原本不限流）；限流器加 `maxKeys` 上限 |
| HIGH | 会话 cookie 是固定 HMAC，服务端不检查过期 | 已修复：cookie 值改为 `<exp>.<HMAC(exp)>`，服务端校验签名和到期时间 |
| HIGH | 先软删除、后删文件，删文件失败后无法重试；运行中的任务可能重新写入文件 | 已修复：先删文件，最后软删除（失败可直接重试）；有非终态任务时返回 409 |
| HIGH | 没有带条件更新的持久化状态转换 | 已修复：新增 `transitionJob(id, expected, next)`，先经过状态机校验，再执行 `UPDATE ... WHERE id=? AND status=?` |
| MEDIUM | `DATA_DIR/uploads` 或 `pages` 是符号链接时，删除可能越出数据目录 | 已修复：数据根目录必须是真实目录，且 realpath 必须位于 `DATA_DIR` 内；项目目录是符号链接时只删除链接本身 |
| MEDIUM | 枚举列在数据库层没有 `CHECK` 约束 | 已修复：所有契约枚举列都加了 `CHECK` 约束（迁移尚未发布，直接重新生成了 `0000_init`） |
| MEDIUM | `PUBLIC_BASE_URL` 是公网 http 地址时，cookie 不带 `Secure` | 暂不修复：真机验收要用手机通过局域网 http 地址扫码访问，强制 https 会破坏这一流程。cookie 在 https 部署下会自动带上 `Secure`；部署文档（17 号）要求公网部署使用 https |
| MEDIUM | 项目列表有 `1 + 3N` 次查询 | 暂不修复：单个商家的项目数通常只有几十个，better-sqlite3 的同步查询是微秒级。等 10 号补充 `views7d` 时再统一改成聚合查询 |

**已知取舍**：全局失败预算意味着攻击者可以让管理员在 15 分钟内无法登录（已登录的会话不受影响）。这个项目只有一位管理员，部署在单实例上，相比可以绕过的按 IP 限流，这个取舍更安全。

### 第 2 轮：5 HIGH，3 MEDIUM

| 级别 | 问题 | 处理 |
|---|---|---|
| HIGH | 失败预算用完后，正确口令也返回 429，可被用来锁定管理员 | **不采纳，项目负责人已于 2026-10-11 确认保持现行为**。如果锁定期间正确口令仍返回 200、错误口令返回 429，攻击者就能继续无限猜测，靠响应码区分对错，限流完全失效。保留现行为：锁定只影响新登录和 Bearer 请求，已登录的会话不受影响；口令至少 12 位 |
| HIGH | 登录接口的 `request.json()` 不限大小 | 已修复：`readJsonLimited()` 在流式读取时强制 1 KiB 上限，超出返回 413，不依赖 `Content-Length` |
| HIGH | 删除流程有 TOCTOU 竞态，删除过程中可能创建新任务 | 已修复：`claimProjectDeletion()` 在一个 IMMEDIATE 事务里检查活动任务并标记删除；`createJobIfIdle()` 在事务内拒绝已删除的项目；重复 DELETE 会重试清理并返回 204（幂等） |
| HIGH | 公网 http 部署时 cookie 不带 `Secure` | 已修复（折中方案）：环境校验拒绝公网 `http://`；http 只允许回环地址、RFC 1918 局域网地址和 `.local` 域名，保留真机通过局域网扫码验收的流程 |
| HIGH | `assets` 的字段是否可空没有与 `kind` 绑定 | 已修复：增加数据库 CHECK 约束。`image` 记录必须有 path/width/height/sha256/bytes，且 text 为空；`text` 记录必须有 text，且 path 为空。`docs/CONTRACT.md` 是共享契约的原文副本，按规则不改，这条约束只记录在本文件 |
| MEDIUM | `transition()` 的返回类型不准确 | 已修复：返回 `Omit<T,'status'> & { status: N }` |
| MEDIUM | `deriveProjectState` 对新项目返回 `null`；项目下线后指针仍非空时返回 `previewable` | 暂不修复：契约只定义了三种展示状态，新增 `draft` 需要改契约。`null` 表示还没有可展示的内容，由 11 号界面显示为无标签。是否清空发布指针由 09 号决定（09 号提示词规定下线只设置 `unpublishedAt`） |
| MEDIUM | 项目列表的 N+1 查询 | 同第 1 轮，留给 10 号统一改为聚合查询 |

### 第 3 轮：2 HIGH，1 MEDIUM（已到 3 轮上限）

| 级别 | 问题 | 处理 |
|---|---|---|
| HIGH | 会话 HMAC 以 `ADMIN_TOKEN` 为密钥，攻击者可以为每个候选口令自己伪造 cookie，通过 200/401 离线猜测，绕过失败预算 | 已修复：签名密钥改为 `DATA_DIR/session.key`（32 字节随机数，权限 0600，首次使用时生成），签名内容包含口令指纹，轮换口令后旧会话失效；新增回归测试，确认用真实口令按旧方式伪造的 cookie 会被拒绝 |
| HIGH | 用 `?next=/%09/evil.example` 可以绕过 `safeNext` 形成开放重定向 | 已修复：用固定哨兵 origin 配合 `new URL()` 解析并校验 origin；函数移到 `lib/safe-next.ts`，新增 8 个测试用例 |
| MEDIUM | 把 `docs/CONTRACT.md` 标为 `-diff` 后，契约被篡改在 diff 中看不到 | 已修复：撤回该规则（只是为了第 3 轮 diff 不超过体积上限临时加的） |

项目负责人决定加一轮复审，只看第 3 轮的修复。

### 第 4 轮（`--base 47500b0`，只审第 3 轮修复）：3 HIGH，2 MEDIUM

| 级别 | 问题 | 处理 |
|---|---|---|
| HIGH | `safeNext` 仍可绕过：`https://shizhao.invalid//evil.example/path` 能通过 origin 校验，返回的 `//evil.example/path` 是协议相对 URL | 已修复：只接受以 `/` 开头的原始值，解析后再拒绝以 `//` 开头的 pathname；补了回归测试 |
| HIGH | `session.key` 用 `wx` 模式写入，文件先出现、后写内容，并发读取可能读到半个文件；进程崩溃会留下损坏的密钥文件 | 已修复：先写入临时文件（权限 0600）并 fsync，再用 `link()` 原子发布（不会覆盖已有文件）；新增 8 个进程并发创建的测试 |
| HIGH | 已存在的 key 文件不做任何校验（符号链接、权限、属主） | 已修复：用 `O_NOFOLLOW` 打开文件，再用 `fstat` 校验是否为普通文件、权限是否为 0600、属主是否为当前用户；任何一项不符合就拒绝启用会话（fail closed）。注：能植入这个文件的攻击者本来就能写 `DATA_DIR`，实际风险较低 |
| MEDIUM | hex 解码会忽略尾部的非法字符 | 已修复：内容必须严格匹配 64 位十六进制 |
| MEDIUM | 密钥缓存在进程内，替换文件后不会生效 | 已修复（明确规定）：部署形态是单实例（R3），更换 `session.key` 后需要重启服务；注释已改为这个说法 |
