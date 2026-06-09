---
name: deck-rd-rhythm-agents
zh_name: "研发节奏 Agents 对比图"
en_name: "R&D Rhythm Agents Comparison"
emoji: "📊"
description: "单页 1920×1080 图表, 对比传统研发串行节奏与 Agents Team 并行压缩节奏"
category: slides
scenario: engineering
aspect_hint: "1920×1080 (16:9)"
featured: 23
recommended: 10
tags: ["engineering", "agents", "研发流程", "pd", "efficiency", "chart", "one-page"]
example_id: sample-deck-rd-rhythm-agents
example_name: "研发节奏 · Agents Team vs 传统"
example_format: markdown
example_tagline: "一页图表展示 PD 压缩与流程变化"
example_desc: "传统 17PD/10d 对比 Agents Team 6.5PD/6.5d, 含 Agent 内化括号与 Token 成本"
---

【模板: 研发节奏 Agents 对比图】
【意图】把传统研发模式和 Agents Team 模式放在同一张 1920×1080 单页图表里, 重点解释「工作方式变化」和「人日 / 周期 / Token 成本」, 适合管理层汇报、研发效能复盘、AI 编程工作流宣讲。

【硬性规格】
- 单文件 HTML, 只输出 1 页。
- 画布固定 `1920×1080`, 顶层必须是 `<section class="slide is-active" data-slide-id="1">`。
- 使用纯 HTML/CSS + inline SVG, 不引入 Chart.js / D3 / 外部图表库。
- 预览必须完整适配任意浏览器视窗: `.slide` 用 `transform: translate(-50%,-50%) scale(min(100vw / 1920px, 100vh / 1080px))` 居中缩放。
- 不要长报告, 不要多页 deck, 不要营销落地页。

【信息结构】
1. 顶部: 一句强观点标题, 说明 Agents Team 如何把研发节奏从串行压成并行。
2. 右上角 meta 只保留有计算价值的信息:
   - Example / 需求口径
   - Baseline / 传统总人日和周期
   - Agents Team / 改造后总人日和周期
   不要放团队人数、需求规模这类无助于图表理解的信息。
3. 主图: 两条横向节奏线, 共用同一个 PERSON-DAYS 比例尺。
   - 传统模式行: 按实际 PD 宽度绘制每个阶段。
   - Agents Team 行: 按实际 PD 宽度绘制改造后的阶段。
   - 流程块宽度必须和人日比例一致, 不要为了视觉均分。
4. Agent 内化关系:
   - 用一个大括号放在传统流程条下方, 覆盖「拆分、编码/单测、联调、自测/修 bug」这一段。
   - 大括号文字说明: 后端 / 前端 Agent 把这些工作内化压缩为 1PD。
   - 再用一条轻虚线从 Agents Team 行的 Agent 小块指向这个括号, 表达对应关系。
5. 右侧 KPI 卡:
   - 单需求人日: Baseline → Agents Team, 并写出约减少百分比。
   - 研发周期: Baseline → Agents Team。
   - Token 变量成本: 用人民币估算, 不区分 input / output。

【默认示例数据】
如果用户没有给完整数据, 使用以下一周开发量口径:
- 传统: 拆分 0.5PD; 前端开发 5PD; 后端开发 5PD; 单测算在编码内; 联调 1.5PD; 自测 / 修 bug 2PD; CR 0.5PD; 测试 2.5PD; 上线不计入。
- 传统合计: 17PD, 纯研发周期 10d。
- Agents Team: 方案确定 1PD; 前后端 Agent 合计 1PD; 人工 CR 2PD; 测试 2.5PD; 上线不计入。
- Agents Team 合计: 6.5PD, 研发周期 6.5d。
- Token: 2kw Token, 成本约 ¥2k, 按 Opus 4.7 粗估。

【视觉风格】
- 基调: editorial engineering chart, 暖白纸面 + 极浅网格 + 墨黑标题 + teal accent。
- 图表主体应比说明文字更重要, 右侧 KPI 卡清晰但不抢主图。
- 卡片圆角不超过 8px; 页面区块不要套卡片。
- 字体建议: 标题用粗黑中文 sans + italic serif 英文强调; 数据和刻度用 mono。
- 颜色控制在 4 类以内: ink / muted / teal agent / warm old / blue test。
- 不要 emoji 装饰、不要 3D、不要渐变球、不要多色彩虹。

【计算要求】
- 先根据输入计算每个阶段 PD, 再映射到横向比例尺。
- 如果输入数据不闭合, 在图中采用最可信的总人日, 并在底部小字标注假设。
- 减少百分比计算公式: `(baselinePD - agentPD) / baselinePD`。
- 上线如果用户说不计入, 可以作为流程端点呈现, 但不能计入总 PD。

【输出要求】
- 输出完整 HTML, 不要解释。
- 所有文案必须用用户输入的业务语境重写, 不要照搬示例公司名或虚构字段。
- 最终页面不能有横向或纵向滚动条, 文本不能互相覆盖。
