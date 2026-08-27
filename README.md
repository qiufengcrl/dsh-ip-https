# dsh-ip-https

DeepSeek Harness 插件：远程浏览器能改设置，并用 Let’s Encrypt **IP 证书**做 HTTPS。不需要域名、不用备案、没有登录。

装完不用再手写 nginx。本插件不改 dsh 源码，也不改它安装目录里的文件。

公网打开后，谁能访问地址，谁就能改模型和在工作区跑命令。请自己用安全组 / VPN 限制来源。

## 做什么

1. **远程设置**：往页面注入脚本，让设置页按本机模式写入 `settings.yaml`。
2. **改头**：把 `Host` / `Origin` 改成 `127.0.0.1:<dsh端口>`，特权 RPC 和 pocket 的 `tunnel.start` 不再 403。
3. **自动 HTTPS**：探测公网 IP，申请 Let’s Encrypt `shortlived` IP 证书（约 6 天），80 跳 443，到期前约 48 小时自动续。

## 未装插件时

公网用 `http://<IP>:<端口>` 打开（不是 HTTPS、也不是本机），浏览器没有安全上下文，`crypto.randomUUID` 不可用，设置页和工作区会直接报错：

**模型加载失败**

![模型页：crypto.randomUUID is not a function](docs/before-models.png)

**Agent 预设加载失败**

![设置里的 Agent 预设：crypto.randomUUID is not a function](docs/before-agent-preset.png)

![通用设置里的预设下拉：crypto.randomUUID is not a function](docs/before-general.png)

**选择工作区目录失败**

![选择工作区目录：crypto.randomUUID is not a function](docs/before-workspace.png)

装上本插件后走 `https://<公网IP>/`，并注入 polyfill，这些页面可以正常打开、远程改设置。

## 安装 / 更新

需要已经能跑的 `dsh`（Node 22.5+），以及本机 `openssl`（生成带 IP SAN 的 CSR）。80/443 要对公网开放（安全组 + 防火墙）。

从任意 DeepSeek Harness 安装：

```bash
dsh plugin --profile web add dsh-ip-https
```

或更新插件 `dsh-ip-https`：

```bash
dsh plugin --profile web update dsh-ip-https@latest
```

然后启动网页界面。无需构建，也无需额外重启：

```bash
dsh web
```

启动后看终端里的 `dsh-ip-https URL`，用那一行打开即可。不必事先判断本机有没有 nginx。

## 已经有 nginx / Caddy 时

插件**不会改**你现有的反代配置。80 或 443 被占时会自己退让，并在日志里写明原因和真正能打开的地址：

- **443 被占**：改听 `3443`（可配），用 `https://<公网IP>:3443/`
- **80 被占**：签不了 Let’s Encrypt IP 证书，也没有 80→443；远程改设置仍然有效

想用 `https://<公网IP>/`：停掉占用 80/443 的程序后重启 `dsh`。继续用现有 nginx 当入口时，把上游指到日志里的端口，并把 `Host` 设成 `127.0.0.1:<dsh端口>`，否则特权 RPC 会 403。

在 profile 的 `cordis.patch.yml` 里可改：

| 项 | 默认 | 含义 |
|---|---|---|
| `listenHost` | `0.0.0.0` | 网关监听地址 |
| `httpsPort` | `443` | HTTPS |
| `httpPort` | `80` | ACME + 跳转 |
| `fallbackPort` | `3443` | 443 被占时的后备端口 |
| `autoTls` | `true` | 自动申请 IP 证书 |
| `publicIp` | 空 | 留空则自动探测 |
| `acmeEmail` | 空 | 可选，到期通知 |
| `acmeStaging` | `false` | `true` 走 LE 测试环境 |

设置页解锁用的是页面注入，不是改 dsh 的 `client.js`。dsh 大版本如果改了模块加载器，需要升级本插件。
