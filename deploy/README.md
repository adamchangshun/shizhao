# 公网部署：从一台新服务器到手机扫码可用

本目录把实招部署到一台单实例 Linux 服务器：应用容器（复用 14 号的 `Dockerfile`）跑在 Caddy 后面，Caddy 自动申请 HTTPS 证书。部署形态按共享契约 R3：**单实例、持久磁盘、长期运行的 Node 进程**，不能用 Vercel 等 Serverless 平台。

| 文件 | 作用 |
|---|---|
| `docker-compose.prod.yml` | 生产编排：`shizhao` 应用（非 root，不对外开放端口）+ `caddy`（80/443） |
| `Caddyfile` | 反向代理：自动 HTTPS、HTTP 强制跳转 HTTPS、覆盖 `X-Real-IP`、请求体上限、不记访问日志 |
| `.env.example` | 生产配置模板，复制为 `deploy/.env`（权限 600） |
| `backup.sh`、`cron.example` | 每日备份 `data/`，保留 7 份，备份目录权限 700 |
| `Caddyfile.precheck`、`precheck/` | 部署前用静态页检查域名在微信里能否打开 |

下文以 **Ubuntu 24.04、2 核 4G、仓库放在 `/opt/shizhao`、域名 `shop.example.com`** 为例，命令里的域名、邮箱都要换成你自己的。

## 0. 先做决定：服务器与域名

| 情况 | 方案 |
|---|---|
| 手上有**已备案**的域名 | 用中国大陆服务器 + 该域名，微信访问最稳定 |
| 没有备案域名（新办备案要数周） | 用**香港或其他境外**轻量云服务器 + 自有域名；微信可能出现提示或拦截，必须按第 5 步实测 |

域名要求：

- 用你自己的独立域名，后缀选 `.com`、`.cn` 等常见后缀，不用 `.top`、`.xyz`。
- **不要**用 `*.github.io`、`*.vercel.app`、`*.pages.dev`、`*.netlify.app` 这类共享父域名：同一父域名下有人违规，会被整体拦截。
- 新注册的域名先到[腾讯网址安全中心](https://urlsec.qq.com/)查一次，确认没有历史违规记录。

## 1. 域名解析

在域名服务商的 DNS 控制台添加一条 A 记录，指向服务器公网 IPv4：

| 主机记录 | 类型 | 记录值 | TTL |
|---|---|---|---|
| `shop`（用根域名就填 `@`） | A | 服务器公网 IP | 600 |

服务器有公网 IPv6 时可以再加一条 AAAA 记录；没有就不要加，否则一部分手机会连不上。解析生效后，在自己电脑上确认：

```bash
dig +short shop.example.com      # 应输出服务器 IP
```

## 2. 登录服务器，做基础设置

```bash
ssh root@<服务器IP>

apt-get update && apt-get -y upgrade
timedatectl set-timezone Asia/Shanghai

# 防火墙：只放行 SSH、80、443（443/udp 用于 HTTP/3）
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# 4G 内存在服务器上构建镜像比较紧张，加 2G 交换空间
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

注意：Docker 发布的端口不受 ufw 控制。本配置只有 Caddy 发布了 80 和 443，应用的 6688 端口没有发布，所以公网访问不到。

## 3. 安装 Docker

```bash
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version && docker compose version
```

境外服务器一般可以直连 Docker 官方源；大陆服务器如果下载很慢，改用云厂商提供的 Docker 镜像源。

## 4. 获取代码

```bash
git clone https://github.com/adamchangshun/shizhao.git /opt/shizhao
# 大陆服务器可改用 Gitee：git clone https://gitee.com/sheng-changshun/shizhao.git /opt/shizhao
cd /opt/shizhao/deploy
```

## 5. 微信预检：先用静态页测域名（部署应用之前必做）

这一步只启动 Caddy，用真实域名和真实 HTTPS 证书提供一个静态页，用来尽早发现微信拦截。证书保存在 `shizhao_caddy_data` 卷里，第 8 步正式部署时会直接复用。

```bash
cd /opt/shizhao/deploy
docker run -d --name shizhao-precheck \
  -p 80:80 -p 443:443 \
  -e DOMAIN=shop.example.com -e ACME_EMAIL=you@example.com \
  -v "$PWD/Caddyfile.precheck:/etc/caddy/Caddyfile:ro" \
  -v "$PWD/precheck:/srv:ro" \
  -v shizhao_caddy_data:/data \
  caddy:2.10-alpine

sleep 20
curl -sI http://shop.example.com | head -1     # 应为 308 跳转
curl -s https://shop.example.com | grep 访问测试  # 应能看到页面标题
```

然后用手机实测下面三种场景，**每种都记录结果，有提示的截图**：

1. 用 [草料二维码](https://cli.im/) 等工具把 `https://shop.example.com/` 生成二维码，用微信「扫一扫」扫码打开。
2. 在微信一对一聊天中发送这个链接，点开。
3. 在微信群中发送这个链接，让另一位群成员点开。

| 看到的结果 | 含义 | 下一步 |
|---|---|---|
| 直接打开 | 通过 | 继续第 6 步 |
| 「非微信官方网页，请确认是否继续访问」 | 软提示，点「继续访问」能打开 | 可以继续，但要记录原文和截图；材料中写明「正式运营需完成 ICP 备案」 |
| 「如需浏览，请长按网址复制后使用浏览器访问」 | 硬拦截 | **停止部署**，换域名、借用已备案域名或改用大陆服务器后重测 |
| 「已停止访问该网页」 | 域名被封 | **停止部署**，立即换域名 |

预检通过后删除测试容器（证书卷保留）：

```bash
docker rm -f shizhao-precheck
```

## 6. 生产配置 `deploy/.env`

```bash
cd /opt/shizhao/deploy
install -m 600 .env.example .env      # 创建时就是 600，只有 root 可读写
openssl rand -base64 32 | tr -d '/+=' | cut -c1-32   # 生成管理口令，复制下来
nano .env
```

必须填写的项：

| 变量 | 填什么 |
|---|---|
| `DOMAIN` | `shop.example.com` |
| `ACME_EMAIL` | 你的邮箱（证书到期提醒） |
| `PUBLIC_BASE_URL` | `https://shop.example.com`，必须和 `DOMAIN` 一致，二维码内容由它生成 |
| `ADMIN_TOKEN` | 上面生成的随机串（至少 12 个字符），只保存在这个文件里 |
| `PROVIDER` 与 `LLM_*` | 演示可保持 `mock`；接真实模型见仓库根目录 README 的「接入真实模型」 |

```bash
ls -l .env      # 确认是 -rw------- root root
```

`.env` 不进 git，也不进镜像（`.gitignore` 和 `.dockerignore` 都排除了 `.env*`）。另外在你自己的密码管理器里保存一份，备份脚本不备份它。

## 7. 数据目录

应用容器以 uid 1000（镜像内的 `node` 用户）运行，所以宿主机的数据目录要属于 1000，并且只有它能访问：

```bash
install -d -o 1000 -g 1000 -m 700 /opt/shizhao/data
```

## 8. 构建并启动

```bash
cd /opt/shizhao/deploy
docker compose -f docker-compose.prod.yml up -d --build    # 首次构建约 5～10 分钟
docker compose -f docker-compose.prod.yml ps                # 两个服务都应为 running，shizhao 为 healthy
docker compose -f docker-compose.prod.yml logs -f --tail=50 # 看到数据库迁移完成和 Next.js 启动后 Ctrl+C
```

验证：

```bash
curl -sI http://shop.example.com | head -3            # 308，Location 为 https://
curl -s https://shop.example.com/api/health           # {"ok":true}
curl -sI https://shop.example.com | grep -i strict    # 有 Strict-Transport-Security
nc -zv -w 3 <服务器IP> 6688                           # 在你自己的电脑上运行，应连接失败
```

长图（共享契约 R9）需要镜像里带 Chromium：在 `.env` 中设置 `WITH_QA=true`、`LONG_IMAGE_ENABLED=true` 后重新运行 `up -d --build`。镜像会增大约 500MB，长图生成时内存占用较高，2 核 4G 建议先保持关闭；关闭时发布照常进行，只是不生成长图。

## 9. 第一次使用：从建项目到扫码

1. 手机或电脑打开 `https://shop.example.com/`，用 `ADMIN_TOKEN` 登录。
2. 新建项目，上传商品照片和文字。
3. 抽取事实，逐项核对后确认。
4. 生成页面，预览满意后发布。
5. 下载二维码（PNG 或 SVG），用微信「扫一扫」扫码，打开的是 `https://shop.example.com/p/<短码>/`。

## 10. 日常维护

```bash
cd /opt/shizhao && git pull
cd deploy && docker compose -f docker-compose.prod.yml up -d --build   # 更新代码
docker compose -f docker-compose.prod.yml restart shizhao              # 修改 .env 后重启
docker image prune -f                                                  # 清理旧镜像
```

## 11. 每日备份

`backup.sh` 每次把 `data/` 打成一个 `tar.gz`（数据库通过运行中的容器取一致性快照），保存到 `/var/backups/shizhao`，只保留最新 7 份。备份里有数据库、上传的照片、生成的页面和 `session.key`（登录会话签名密钥），和服务器本身一样敏感：备份目录权限 700，每个文件 600。

```bash
chmod 700 /opt/shizhao/deploy/backup.sh
/opt/shizhao/deploy/backup.sh                                   # 先手动跑一次
ls -l /var/backups/shizhao                                      # drwx------，文件 -rw-------
install -m 644 /opt/shizhao/deploy/cron.example /etc/cron.d/shizhao-backup   # 每天 03:30 自动备份
```

需要异地保存时，用 `scp` 或对象存储把归档复制到你自己控制的位置；不要放进公开的存储桶，也不要提交到 git。

**恢复**（会覆盖当前数据）：

```bash
cd /opt/shizhao/deploy
docker compose -f docker-compose.prod.yml stop shizhao
mv /opt/shizhao/data /opt/shizhao/data.before-restore
install -d -o 1000 -g 1000 -m 700 /opt/shizhao/data
tar -xzf /var/backups/shizhao/shizhao-<时间>.tar.gz -C /opt/shizhao/data
chown -R 1000:1000 /opt/shizhao/data
docker compose -f docker-compose.prod.yml start shizhao
```

确认恢复正常后，再删除 `data.before-restore`。

## 安全要点

- 只有 Caddy 对外开放 80 和 443；80 只用于申请证书和跳转到 HTTPS。应用的 6688 端口只在 compose 内部网络中可达。
- 应用容器以 uid 1000 运行，丢弃全部 Linux capabilities，禁止提权；Caddy 也丢弃全部 capabilities，只保留绑定 80/443 所需的 `NET_BIND_SERVICE`。
- Caddy 用真实对端地址覆盖 `X-Real-IP`，所以 compose 中开启了 `TRACK_TRUST_PROXY` 和 `GUARD_TRUST_PROXY`，访问统计和文案检查 API 能按访客限流。这个前提是应用端口不对外开放，不要给 `shizhao` 服务加 `ports`。
- Caddy 不写访问日志，应用也不记录请求体，服务器上不留访客 IP。
- 管理口令只在 `deploy/.env` 里，权限 600；Caddy 容器只拿到 `DOMAIN` 和 `ACME_EMAIL` 两个变量。

## 真机验收（待填）

部署完成后逐项实测，全部通过才算完成。第 1、2 项若出现「非微信官方网页」软提示，记为「通过（有提示）」，附原文和截图；硬拦截或域名被封记为不通过。系统相机扫码只能作为演示现场的应急手段，不能代替第 1、2 项。

| 编号 | 场景 | 通过标准 | 设备与网络 | 结果 | 截图 / 备注 |
|---|---|---|---|---|---|
| 1 | 微信「扫一扫」扫码 | 直接打开页面，没有拦截；有提示时记录原文与截图 | | 待填 | |
| 2 | 二维码发进微信群，群成员点开 | 同上 | | 待填 | |
| 3 | 移动 4G/5G 网络（关闭 Wi-Fi） | 首屏 3 秒内显示 | | 待填 | 实测首屏时间： |
| 4 | 安卓与 iPhone 各一台 | 页面无错位、图片正常、拨号按钮可用 | 安卓： iPhone： | 待填 | |
| 5 | 系统相机扫码（不经过微信） | 在浏览器中打开正常 | | 待填 | |
| 6 | 长图（开启 `LONG_IMAGE_ENABLED` 时） | 下载长图发给另一台手机，图片清晰，微信「识别图中二维码」能打开 | | 待填 / 未开启 | |

验收时同时记录：服务器所在地区与配置、域名、每月服务器费用。
