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
