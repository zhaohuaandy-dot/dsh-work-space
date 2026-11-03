# dsh-work-space
dsh 实验仓库

## trade-crm/ — 外贸客户管理系统

参照《孚盟海关数据 · 客户管理》参考文档（孚盟MX「全流程版本」能力清单）实现的**外贸工作管理系统**：客户档案、公海与客保、跟进时间轴、**海关数据分析**（含潜在买家一键建档）、商机看板、报价单与订单跟单、邮件营销与开发信模板库。

技术栈为零第三方依赖的 Node.js（`node:http` + `node:sqlite`，Node ≥ 22.5）+ 原生前端，无需构建即可运行：

```bash
cd trade-crm
npm start                 # http://127.0.0.1:3000
npm test                  # API 冒烟测试（临时库，独立端口）
```

详见 [trade-crm/README.md](trade-crm/README.md)，界面截图见 [trade-crm/docs](trade-crm/docs/README.md)。
