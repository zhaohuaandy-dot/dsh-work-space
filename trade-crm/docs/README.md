# 界面证据：改动前 / 改动后

本目录保存 PR 中的 Before / After 视觉证据。

## Before（main 分支，提交 2673069）

- `before/baseline-state.png`：main 分支的真实状态快照。仓库当时只有 `README.md`（34 字节），**不存在任何 Web 界面、API 或数据**，因此没有"改动前的页面"可以截图。
- `before/baseline-state.html`：该快照页面的源文件，由脚本从 base 分支克隆中读取真实文件树与 README 内容生成（`scripts/baseline-snapshot.mjs`）。
- 复现方式：

  ```bash
  git clone --depth 1 https://github.com/zhaohuaandy-dot/dsh-work-space.git baseline
  node scripts/baseline-snapshot.mjs baseline docs/before/baseline-state.html
  ```

## After（本次分支 agent/trade-crm-system-d738b738d5a5）

- `screenshots/*.png`：由 `scripts/capture.mjs` 在真实运行的应用上抓取，视口 1440×1000、浅色主题、演示数据（`node server/seed.mjs --reset` 后的初始状态）。
- 抓取命令：

  ```bash
  npm start                                   # 或 PORT=4317 node server/index.mjs
  node scripts/capture.mjs http://127.0.0.1:3000 docs/screenshots
  ```

| 文件 | 页面 / 状态 |
| --- | --- |
| `customers.png` | 客户档案列表（筛选、分级、客保到期、负责人） |
| `customer-detail.png` | 客户详情（档案、联系人、跟进时间轴、海关记录、商机、客保提示） |
| `customs.png` | 海关数据分析（交易走势、采购商排名、贸易监测潜在买家） |
| `opportunities.png` | 商机看板（六阶段拖拽推进） |
| `trade-quotations.png` | 交易管理 · 报价单（明细合计、状态流转） |
| `trade-orders.png` | 交易管理 · 订单（跟单进度与收款） |
| `dashboard.png` | 工作看板（KPI、漏斗、分级、贸易监测） |
| `sea.png` | 公海管理 |
| `activities.png` | 邮件营销活动与打开/回复率 |
| `templates.png` | 开发信模板库与变量预览 |

## 说明

基线仓库为空仓库，Before 无可截图的界面，这一点在 PR 描述中同样如实说明；没有用 mockup 冒充改动前的实现。
