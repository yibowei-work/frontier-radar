# 前沿雷达

给产品经理使用的 AI 与机器人行业决策台。它把公司官方发布、官方 GitHub 与论文源整理成可筛选的情报流，并为重点事件补充“为什么重要”和“对职业发展的启示”。

网站：https://yibowei-work.github.io/frontier-radar/

## 它解决什么问题

- **先看重点**：首页优先展示最值得行动的 3 个信号，而不是制造信息瀑布。
- **可追溯**：每条情报都保留一手来源、发布时间、可信度和复查状态。
- **可行动**：将动态映射到产品影响、能力变化和本周可完成的小练习。
- **中外兼顾**：覆盖海外官方 RSS，以及中国 AI/机器人公司的官方 GitHub 动态。
- **持续核查**：不是一次性抓取；旧事件内容变化会记录修订。

## 自动运行节奏

GitHub Actions 每天北京时间 11:00 运行一次：

- 每天：核查最近 72 小时。
- 每周日：同时回查本月。
- 每月 1 日：同时回查完整上月。
- 若定时任务延迟或漏跑：根据 `public/data/state.json` 自动补做遗漏的周检和月检。

GitHub 的定时任务可能延迟，因此网站同时展示计划频率与实际完成时间。

## 数据原则

采集顺序以官方 RSS、公司官方 GitHub、论文源为主。聚合站和社交媒体不会直接作为高置信事实。站点只保存标题、短摘要、结构化标签和原文链接，不镜像全文。

`config/sources.json` 是来源白名单；`scripts/collect.py` 负责时间窗口、抓取、标准化、去重、评分和修订记录；`scripts/validate_data.py` 在发布前检查数据安全与完整性。

## 本地运行

```bash
npm install
npm run collect
npm run validate:data
npm run dev
```

测试与构建：

```bash
npm run test:collector
npx tsc --noEmit
npm run build
```

## 技术栈

Vinext、React、TypeScript、Tailwind CSS、shadcn/ui、Python 标准库与 GitHub Actions。收藏仅保存在浏览器本地，不需要账号。

## 说明

自动生成的“产品影响”和“职业启示”是研究提示，不代替对原始材料的核查。公司自述仍应按“公司称”理解；融资、销量、订单和 benchmark 等高影响主张应等待更多独立证据。

## License

MIT
