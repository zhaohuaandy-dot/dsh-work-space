# 常驻运行说明

本目录是**独立安装副本**，服务在这里长期运行（`ws/trade-crm` 只是仓库里的源码副本，会被 Git 操作影响）。

## 现在怎么访问

浏览器打开：**http://127.0.0.1:4317**

该服务已配置为常驻：

- **开机/登录自动启动** — 入口在用户「启动」文件夹：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TradeCRM.vbs`（静默运行，不弹窗）
- **崩溃自动重启** — `supervisor.mjs` 守护进程监控服务进程，异常退出后按 1s→30s 退避自动拉起
- **单实例保护** — 重复启动会直接退出，不会占用端口或产生多个进程
- **日志** — `logs/server.log`，超过 5MB 自动轮转

## 常用操作

| 操作 | 方式 |
| --- | --- |
| 启动（已运行则无副作用） | 双击 `start.cmd` |
| 停止 | 双击 `stop.cmd` |
| 查看状态 | `node status.mjs` |
| 查看日志 | `type logs\server.log` |
| 重置演示数据 | `node server\seed.mjs --reset`（会清空现有数据） |

`start.cmd` / `stop.cmd` / `startup-entry.vbs` 都刻意只用 ASCII 字符：`cmd.exe` 按 ANSI 解析 `.cmd`、`WScript` 按 ANSI 解析 `.vbs`，写入 UTF-8 中文会让脚本被错误解析而无法启动。

## 目录说明

```
C:\Users\4699\trade-crm\
├── server/            后端（node:http + node:sqlite）
├── web/               前端（原生 ES Modules，无需构建）
├── data/              SQLite 数据库（自动生成，含演示数据）
├── logs/              server.log、supervisor.pid
├── supervisor.mjs     守护进程（自动重启 + 单实例 + 日志轮转）
├── start.cmd          启动
├── stop.cmd           停止
├── status.mjs         状态检查
├── stop.mjs           停止逻辑
└── startup-entry.vbs  开机自启入口（ASCII）
```

## 换端口 / 换数据目录

守护进程读取环境变量：

```bat
set PORT=8080
set DSH_TCRM_DATA=C:\Users\4699\trade-crm-data
wscript.exe startup-entry.vbs
```

修改后请同步更新 `startup-entry.vbs`（或系统环境变量）中的设置，否则开机自启仍使用默认端口 4317。

## 卸载常驻

1. 删除「启动」文件夹里的 `TradeCRM.vbs`
2. 双击 `stop.cmd` 停止服务
3. 按需删除本目录

## 与仓库源码的关系

仓库中的 `trade-crm/` 是源码与 PR 交付物（含文档、截图、测试脚本）。这里的副本额外包含常驻运行所需的 `supervisor.mjs`、`start.cmd`、`stop.cmd`、`status.mjs`、`startup-entry.vbs`。若仓库更新，可用 `xcopy /E /Y` 覆盖本目录的 `server/`、`web/`、`scripts/`（不要覆盖 `data/`）。
