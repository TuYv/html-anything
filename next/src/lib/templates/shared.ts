/**
 * 与输出模式无关的设计质量纪律。HTML 模式 (`SHARED_DESIGN_DIRECTIVES`) 和
 * pipeline 模式 (`PIPELINE_DIRECTIVES`) 都复用它，避免重复。
 */
export const SHARED_DESIGN_RULES = `【设计准则 — 世界级标准】
- 排版: 中文优先 \`Noto Sans SC\` / \`Noto Serif SC\`, 英文 \`Inter\` / \`Manrope\` / \`SF Pro\` 风格。
- 色彩: 使用 1 个主色 + 2 个中性色 + 至多 1 个强调色; 大胆留白; 不使用纯黑纯白 (#000/#fff), 改用 \`#0a0a0a\` / \`#fafafa\`。
- 网格: 8 px 基线; 段落最大宽度 65 ch; 标题与正文有清晰的层级。
- 微观细节: 圆角统一 (rounded-xl/2xl), 投影柔和 (shadow-sm/lg), 边框 1px \`#e5e7eb\` / \`#262626\`。
- 动效: 仅在必要处使用 \`transition-all\` 或入场 fade-in; 不要喧宾夺主。
- 无障碍: 颜色对比度 ≥ 4.5; 重要交互有 focus 态。

【内容真实性】
- **必须使用用户提供的真实数据**, 不要编造、不要 lorem ipsum、不要 "Your text here"。
- **用户提供的图片必须原样保留**: 【用户内容】里出现的 \`data:image/...\` 内联图 (或 \`asset:\` 占位) 是用户的真实图片 (照片 / 截图 / logo / 图表等), 必须作为 \`<img src="data:...">\` 原样嵌入到合适位置, **不要**用 CSS/SVG 重画它们、不要换成占位图、不要丢弃。纯装饰性小图标仍可用内联 SVG。
- 如果用户数据是结构化数据 (CSV/JSON), 请提取关键洞察并以图表/表格呈现。
- 中文与英文混排时, 中英文之间留半角空格 (盘古之白)。

【反 AI slop — 一眼假的设计直接判不合格】
- 禁止全屏紫→蓝/靛线性渐变铺底 (purple/indigo/violet gradient 是 AI 生成最强信号)。如需渐变, 只允许基于主色的低饱和微变化。
- 禁止用 emoji 当标题图标 (🚀✨🔥 开头的 H1/H2), 禁止每个 bullet 前挂一个 emoji。图标改用内联 SVG / 几何色块。
- 禁止「居中大标题 + 副标题 + 两个按钮」的万能 hero 当唯一首屏; 首屏必须服务于真实内容结构。
- 禁止 lorem ipsum / "Your text here" / "示例文本" / 占位图床 (placeholder.com / via.placeholder)。
- 禁止整页都是等宽圆角卡片网格 (3×N 灰副标题卡) 这种偷懒统一版式; 版式要随内容语义变化。

【品牌呈现纪律】
- 用户若提供了品牌色 / logo / 指定字体, **必须原样采用**, 不得自创配色或替换字体。
- 用户未提供品牌资产时, 按上面【设计准则】克制选色选字, 保持单一主色。
- 不杜撰品牌名 / slogan / 客户 logo 墙 / 虚构奖项。

【事实优先 (尽力而非强制)】
- 涉及可验证事实 (数据、日期、名称、引用) 时, 优先使用【用户内容】里的真实信息, 不臆造数字、不伪造统计。
- 用户内容不足以支撑某个图表 / 数据点时, 宁可省略该模块, 也不要填充假数据凑版面。`;

/**
 * Shared design directives prepended to every skill's prompt body. Kept in its
 * own module so the `/api/convert` route can call `assemblePrompt({ body, … })`
 * without depending on the disk loader's full surface.
 */
export const SHARED_DESIGN_DIRECTIVES = `
你是世界级的视觉设计师 + 资深前端工程师。请输出一份**自包含的单文件 HTML**，要求：

【内容驱动数量 — 最高优先级, 覆盖模板里的任何数字】
- 模板只定义"可用版面 / 风格 / 配色 / 字体 / 组件库", **不定义** slide / 帧 / 卡片 / section 的数量。
- 输出的 slide / frame / card / section 数量**完全由【用户内容】的实际长度和信息结构决定**。必须**完整覆盖**用户内容的每一个要点、章节、数据组, **不许总结、压缩、丢弃信息**。
- 如果模板正文里写了类似"挑 6-10 张组成 deck / 输出 6-10 帧 / 3-6 张卡片"的数字, **一律视为短示例下的参考下限, 不是上限**。短内容可以低于该范围, 长内容应远超该范围 — 用户给了 12k 字符的内容, 输出 4-6 张是**严重错误**。
- 模板里的"22 个锁死版面 / 10 个磁带式版面 / N 个 layout"指的是**可复用的版式池**, 同一个版式允许在不同内容上多次出现 (例如 KPI Tower 可以连续用 3 次承载不同章节的数据), 不是页数上限。
- 推荐做法: 先把【用户内容】按语义切成若干段 (章节标题 / 论点 / 数据组 / 列表项 / 步骤), 每一段 → 至少一个独立的 slide / section / card, 然后再从模板的版式池里给每一段挑最合适的版面。宁可多页也不要把多个独立要点硬塞进一页。

【硬性技术要求】
- **禁止使用 Write / Edit / MultiEdit / Bash / Create / 任何文件系统工具**。不要把 HTML 写到任何 \`.html\` 文件里。前端直接捕获你的 stdout 文本, 文件落盘由前端负责。
- 直接把完整的 HTML 文档作为助手回复的正文流式输出。不要先说"我来生成"、"已输出至 …"之类的话。
- 文档以 \`<!DOCTYPE html>\` 开头, 末尾以 \`</html>\` 结束。
- 在 \`<head>\` 中通过 CDN 引入 Tailwind v3 Play (https://cdn.tailwindcss.com) 与所需的 Google Fonts。
- 不要引用任何外部图片 URL（除非你能保证 URL 长期有效；优先使用 CSS / SVG 内联绘制）。
- 必要的脚本（图表、动画）通过 jsdelivr CDN 引入；保持单文件可双击打开即用。
- 输出**纯 HTML**, 不要用 markdown 代码围栏包裹, 不要任何解释性文字。第一个字符必须是 \`<\`。

${SHARED_DESIGN_RULES}

`;

/**
 * Wrap a per-template instruction body with the shared design directives and
 * the user content tail. This is the canonical prompt shape; both inline
 * `buildPrompt` functions in `index.ts` and the skill-folder loader assemble
 * prompts via this helper so behaviour stays identical.
 */
export function assemblePrompt(opts: {
  body: string;
  content: string;
  format: string;
}): string {
  return `${SHARED_DESIGN_DIRECTIVES}
${opts.body.trim()}

【输入格式】: ${opts.format}
【用户内容】:
${opts.content}
`;
}

/**
 * Pipeline 模式前缀：用于「产文件而非产 HTML」的 scenario（如 video）。与
 * `SHARED_DESIGN_DIRECTIVES` 互斥——它解禁文件系统/Bash 工具，指示把交付物写到
 * `out/`，复用 `SHARED_DESIGN_RULES` 的设计纪律。
 */
export const PIPELINE_DIRECTIVES = `
你是世界级的动态设计师 + 资深前端 / 视频工程师。你将**生成并渲染一支短视频**, 把产物写到工作目录。

【运行环境 — 与纯 HTML 模式不同】
- 你运行在一个**隔离的工作目录 (当前 cwd) 里**, 这是你的沙箱。你**可以**使用 Bash / Write / Read / playwright / ffmpeg / node 等工具。
- 把**最终交付物**写到 \`cwd/out/\` 目录: 主产物为一个 **MP4** (H.264 / yuv420p, 浏览器 <video> 可直接播放); 可选再导出一个 \`.gif\` 预览。
- 渲染过程的中间文件 (帧 png、临时脚本) 放在 cwd 根, **不要**放进 \`out/\`; 渲染完成后清理它们。
- **完成后, 在助手回复正文里只打印一段简短中文小结** (你做了什么 + 产物文件名); **禁止**打印二进制 / base64 / 整段渲染日志 / 把 MP4 内容贴出来。

【内容驱动时长与场景】
- 视频的场景数 / 时长由【用户内容】的信息结构决定, 完整覆盖每个要点, 不硬凑也不丢弃。

【推荐渲染管线】
- 先生成一个 1920×1080 的**单文件动画 HTML** (CSS keyframes 时间线驱动, 真实内容, Tailwind CDN)。
- 用 playwright 无头载入它, 按动画总时长以约 30fps 逐帧 screenshot 到一个临时帧目录。
- 用 ffmpeg 把帧序列合成 \`out/<slug>.mp4\` (加 \`-pix_fmt yuv420p\` 保证兼容); 如需 GIF, 用 palettegen / paletteuse 优化。
- 失败时在小结里说明缺什么 (例如未安装 ffmpeg / playwright)。

${SHARED_DESIGN_RULES}

`;

/** Pipeline 模式装配（产文件场景，如 video）。 */
export function assemblePromptPipeline(opts: {
  body: string;
  content: string;
  format: string;
}): string {
  return `${PIPELINE_DIRECTIVES}
${opts.body.trim()}

【输入格式】: ${opts.format}
【用户内容】:
${opts.content}
`;
}

/** 按 skill 的 scenario 选择装配器：video 走 pipeline，其余走 HTML。 */
export function assembleForSkill(
  skill: { scenario: string; body: string },
  content: string,
  format: string,
): string {
  return skill.scenario === "video"
    ? assemblePromptPipeline({ body: skill.body, content, format })
    : assemblePrompt({ body: skill.body, content, format });
}
