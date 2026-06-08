---
name: design-review
zh_name: "设计评审报告"
en_name: "Design Review"
emoji: "🔍"
description: "对一份设计/页面做 5 维评分 + 纯 SVG 雷达图 + Keep/Fix/Quick Wins 清单"
category: design
scenario: design
aspect_hint: "auto"
recommended: 4
tags: ["design", "review", "critique", "audit"]
example_format: "markdown"
example_name: "设计评审报告 示例"
example_tagline: "5 维打分 + 整改清单"
---

【模板: 设计评审报告 Design Review】
【意图】像资深设计总监一样, 对【用户内容】里描述或粘贴的设计 (一段描述、一份 HTML、或一张截图的文字转述) 做结构化评审, 产出一页可直接发给团队的评审报告 HTML。

【五个评审维度 (每个 0-100 打分, 并给一句话依据)】
1. 视觉层级 Hierarchy — 重点是否一眼可见, 主次是否分明。
2. 排版 Typography — 字体搭配、字号阶梯、行高与可读性。
3. 色彩与对比 Color & Contrast — 配色克制度、对比度 (≥4.5)、品牌一致性。
4. 留白与网格 Spacing & Grid — 8px 节奏、对齐、呼吸感。
5. 内容真实性与信息密度 Content & Density — 是否真数据、密度是否合适、有无 AI slop 痕迹。

【硬性结构】
- 顶部: 被评审对象标题 + 一行总评 + 一个总分 (5 维平均)。
- 雷达图: 用**纯内联 SVG 画五边形雷达图** (不引入任何图表库 / 不引外链图片), 5 个轴对应 5 个维度, 顶点按各自分数定位, 填充半透明主色。每个轴端标注维度名 + 分数。
- 维度明细: 5 行, 每行 = 维度名 + 分数条 + 一句话依据。
- 三栏清单 (桌面 `grid-cols-3`):
  - ✅ Keep — 做对了、要保留的 (引用具体维度)。
  - 🛠 Fix — 必须修的硬伤 (引用具体维度, 给出怎么改)。
  - ⚡ Quick Wins — 低成本高收益的快速优化 (可立刻动手的)。
- 每条清单项末尾用括号标注它关联的维度, 例: (色彩与对比)。

【设计细节】
- 报告本身也要好看且专业: 8px 网格, 单一主色, 不用纯黑纯白, 分数用色彩编码 (低分暖红, 高分主色)。
- 雷达图必须是真的 SVG 多边形, 顶点坐标随分数变化, 不是一张静态装饰图。
- ✅ / 🛠 / ⚡ 这三个 emoji 仅作为 Keep / Fix / Quick Wins 三个栏目的功能标记使用; 报告其余正文与列表项内部仍遵守「标题不用 emoji 图标、不在每个 bullet 前挂 emoji」的反 slop 规则。
