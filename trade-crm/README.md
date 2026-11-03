# 外贸客户管理系统（Trade CRM）

参照《孚盟海关数据 · 客户管理》参考文档（孚盟MX「全流程版本」能力清单）实现的**外贸工作管理系统**：以客户档案为中心，把**海关数据分析 → 潜在买家建档 → 跟进/客保 → 商机 → 营销触达**串成一条完整的销售流程。

- 零第三方依赖：仅使用 Node.js 内置的 `node:http` 与 `node:sqlite`（Node ≥ 22.5）
- 原生前端（无构建步骤）：ES Modules + 手写 CSS + 内联 SVG 图表
- SQLite 落库，首次启动自动建表并写入演示数据

## 快速开始

```bash
cd trade-crm
npm start          # 默认 http://127.0.0.1:3000
```

可选环境变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 监听端口 | `3000` |
| `HOST` | 监听地址 | `127.0.0.1` |
| `DSH_TCRM_DATA` | 数据目录 | `trade-crm/data` |
| `DSH_TCRM_DB` | 数据库文件路径 | `<数据目录>/trade-crm.db` |

重置演示数据：

```bash
node server/seed.mjs --reset
```

运行 API 冒烟测试（临时数据库、独立端口，不影响现有数据）：

```bash
node scripts/smoke.mjs
```

## 功能

### 工作看板
客户总数 / 本月跟进 / 进行中商机 / 海关交易额 / 营销触达五个核心指标，销售漏斗、客户分级与状态分布、新增客户趋势、海关进口国 TOP、贸易监测提醒、最近新增客户、跟进动态与客户经理业绩。

### 客户管理（对应参考文档「02. 客户管理」）
- **客户档案**：以客户为中心，基础信息 + 联系人（KP 标记）+ 跟进动态 + 海关记录 + 商机 + 营销触达 + 移交记录统一归档；支持多条件筛选、分页、CSV 导出。
- **客户跟进**：业务时间轴，记录跟进方式、内容、关联商机与下一步计划，可追溯历史邮件/商机/海关记录。
- **客保管理**：客户保护期（默认 30 天），到期 / 临期在列表中直接提示并可一键续保，防止重复跟进与业务归属争议。
- **公海管理**：客户放入公海后清空负责人，其他同事可领取并重新获得保护期；管理员可从公海直接分配给指定业务员。
- **客户移交**：交接需接收人确认，确认后客户归属变更并留痕。

### 海关数据分析（对应参考文档「贸易大数据 / 贸易监测」）
- 交易总额、货运量（TEU / 吨）、覆盖商品数与未建档采购商数量。
- 成交走势折线、**采购商排名**（区分"已建档 / 未建档"）、**贸易监测**（近 90 天到港潜在买家）、进口国分布、HS 商品排行、同行出口商（竞争情报）。
- **潜在买家一键建档**：从海关记录直接生成客户档案，并把该采购商的历史提单归到新客户名下；重复建档返回 409。

### 业务管理（对应参考文档「03. 业务管理 · 商机管理」）
- **商机看板**：按阶段（初步接触 → 需求确认 → 报价中 → 谈判中 → 赢单 / 输单）展示，支持拖拽推进阶段，自动更新赢单概率与阶段变更时间。
- 赢单 / 丢单金额与赢单率统计，支持列表视图与关键字检索。

### 报价与订单（对应参考文档「03. 业务管理 · 报价单 / 订单管理 / 可视化跟单」）
- **报价单**：多商品明细（HS 编码、规格、数量、单价）自动合计，贸易术语（FOB/CIF/CFR/EXW/DDP）、装运港、有效期与状态流转（草稿 → 待审批 → 已发出 → 已接受 / 已拒绝 / 已过期）。
- **报价转订单**：一键由已接受报价生成订单（同一报价重复转换返回 409），订单金额取报价合计。
- **订单跟单**：生产/出运状态（待生产 → 生产中 → 待出运 → 已出运 → 已签收）与收款进度（未收款 / 部分收款 / 已收齐，定金按 30% 自动计算），ETD → ETA，14 天内出运提醒，CSV 导出。

### 营销触达（对应参考文档「邮件营销 / 开发信模板库 / 千里眼」）
- **邮件营销**：活动列表 + 目标客户漏斗（待发送 → 已发送 → 已打开 → 已回复），"推进发送"批量流转状态并回写打开率 / 回复率。
- **开发信模板库**：内置开发信、询盘回复、报价跟进、节日问候模板，支持 `{{变量}}` 渲染与示例值预览、复制正文。

## 目录结构

```
trade-crm/
├── package.json
├── README.md
├── scripts/
│   └── smoke.mjs          # API 冒烟测试（临时库 + 独立端口）
├── server/
│   ├── index.mjs          # HTTP 入口：静态文件 + /api 路由
│   ├── api.mjs            # 业务逻辑与路由分发
│   ├── db.mjs             # SQLite 建表与连接
│   └── seed.mjs           # 演示数据（可复现的伪随机）
└── web/
    ├── index.html         # 应用外壳（侧边导航 + 顶栏 + 页面容器）
    ├── styles.css
    ├── util.js            # API 封装、格式化、弹窗、SVG 图表
    ├── app.js             # 路由、导航、全局搜索
    └── views/             # 各页面视图
        ├── dashboard.js      工作看板
        ├── customers.js      客户档案
        ├── customerDetail.js 客户详情
        ├── sea.js            公海管理
        ├── customs.js        海关数据分析
        ├── opportunities.js  商机管理
        ├── trade.js          报价与订单
        ├── activities.js     邮件营销
        ├── templates.js      开发信模板库
        └── handovers.js      客户移交
```

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/stats` | 看板统计 |
| GET | `/api/options` | 下拉选项（国家/行业/状态/来源/用户） |
| GET | `/api/users` | 用户列表 |
| GET | `/api/customers` | 客户列表（`keyword`/`country`/`industry`/`level`/`status`/`source`/`owner`/`sea`/`page`/`size`） |
| POST | `/api/customers` | 新建客户（可带 `contacts[]`） |
| GET/PUT/DELETE | `/api/customers/:id` | 客户详情 / 更新 / 删除 |
| POST | `/api/customers/:id/contacts` | 新增联系人 |
| DELETE | `/api/customers/:id/contact?contact_id=` | 删除联系人 |
| POST | `/api/customers/:id/followups` | 新增跟进记录 |
| DELETE | `/api/customers/:id/followup?followup_id=` | 删除跟进记录 |
| POST | `/api/customers/:id/protect` | 续保（`protection_days`） |
| POST | `/api/customers/:id/release` | 放入公海 |
| POST | `/api/customers/:id/claim` | 领取公海客户（`user_id`/`protection_days`） |
| POST | `/api/customers/:id/transfer` | 发起客户移交 |
| GET | `/api/handovers` | 移交记录 |
| POST | `/api/handovers/:id/accept` | 确认接收 |
| GET | `/api/customs` | 海关提单单据（`keyword`/`country`/`customer_id`/`potential`/`page`/`size`） |
| GET | `/api/customs/analysis` | 海关数据分析汇总 |
| POST | `/api/customs/convert` | 潜在买家一键建档 |
| GET/POST | `/api/opportunities` | 商机列表（含漏斗）/ 新建 |
| PUT | `/api/opportunities/:id` | 更新商机（阶段变更自动更新概率） |
| GET/POST | `/api/quotations` | 报价单列表（含状态统计）/ 新建（可带 `items[]`） |
| GET | `/api/quotations/:id` | 报价单详情与明细 |
| POST | `/api/quotations/:id/status` | 报价单状态流转 |
| POST | `/api/quotations/:id/convert` | 报价单转订单 |
| GET/POST | `/api/orders` | 订单列表（含汇总）/ 新建 |
| PUT | `/api/orders/:id` | 更新订单状态 / 收款 / 日期 |
| GET | `/api/trade/summary` | 交易汇总（报价、订单、待收金额、临期出运） |
| GET/POST | `/api/activities` | 营销活动列表 / 新建 |
| GET | `/api/activities/:id` | 活动详情与目标客户 |
| POST | `/api/activities/:id/targets` | 追加目标客户 |
| POST | `/api/activities/:id/advance` | 推进发送状态 |
| GET/POST | `/api/templates` | 邮件模板 |
| POST | `/api/templates/:id/render` | 模板变量渲染 |

错误统一返回 `{ "error": "..." }`，并带语义化状态码（400 参数错误、404 不存在、409 重复建档、413 请求体过大）。

## 演示数据

首次启动自动写入：5 个用户、46 个客户、100+ 联系人、149 条海关提单（含 12 个未建档潜在买家）、30 个商机、60+ 条跟进记录、5 个营销活动与 5 个邮件模板。数据以运行当日为基准生成，日期始终贴近"现在"。

## 与参考文档的对应关系

| 参考文档能力 | 本项目实现 |
| --- | --- |
| 贸易大数据 / 贸易监测 | 海关数据分析页：采购商排名、潜在买家、进口国/商品/出口商分布 |
| 客户档案 / 客户管理 | 客户档案列表 + 客户详情（档案、联系人、跟进、海关、商机） |
| 客保管理 | 客户保护期、到期提醒、续保 |
| 公海管理 | 公海页：领取、分配、规则说明 |
| 客户跟进 | 跟进时间轴 + 下一步计划 |
| 商机管理 | 商机看板（拖拽推进阶段）+ 赢单率分析 |
| 报价单 / 订单管理 / 可视化跟单 | 报价与订单页：明细合计、状态流转、报价转订单、跟单进度与收款 |
| 邮件营销 / 开发信模板库 / 千里眼 | 营销活动漏斗、模板库与变量渲染 |

> 未实现：单证管理（报关/议付单证）、财务管理（收款核销、利润结算）、供应链管理（供应商、采购单），以及 AI 外贸助理、移动 APP、MIC 平台对接、知识管理。
