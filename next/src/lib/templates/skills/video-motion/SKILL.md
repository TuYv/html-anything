---
name: video-motion
zh_name: "动态短片"
en_name: "Video Motion"
emoji: "🎬"
description: "把内容做成一支 1920×1080 短视频 (MP4): agent 生成动画 HTML → playwright 抓帧 → ffmpeg 合成"
category: video
scenario: video
aspect_hint: "16:9"
recommended: 5
tags: ["video", "motion", "mp4"]
example_format: "markdown"
example_name: "动态短片 示例"
example_tagline: "一段内容 → 一支 MP4"
---

【Skill: 动态短片 Video Motion】
【意图】把【用户内容】做成一支 1920×1080 的短视频 (MP4), 适合产品介绍 / 数据故事 / 开场片。运行在 pipeline 模式 (你可用 Bash/playwright/ffmpeg, 产物写 out/)。

【动画 HTML 规格】
- 单文件 1920×1080; 用 CSS @keyframes / animation 驱动一条时间线; 每个场景一屏, 入场/出场用 fade / slide, 克制不喧宾夺主。
- 真实内容, 不 lorem; 遵守上面的设计纪律 (主色克制、8px、对比度 ≥4.5)。
- 给每个场景标注时长 (如 data-dur-ms), 或在渲染脚本里写死时间线, 方便逐帧抓取。

【转场与调色 (进阶, 提升质感)】
- 转场: 除 fade/slide 外, 可用 CSS 做 wipe / mask reveal / scale-in / 数字递增等; 全片转场风格统一, 单次 0.3-0.6s, 不要每屏换花样。
- 调色: 渲染后可用 ffmpeg 统一调色给整片定调 (如 `eq=contrast=1.05:saturation=1.05`, 或 `curves` / 套 LUT `lut3d=<file>.cube`); 冷暖与主色一致, 别过度。

【渲染管线】
- 总时长建议 8-20s (随内容多少), 30fps。
- playwright 无头载入 HTML, 按时间线逐帧 screenshot 到临时帧目录 (放 cwd 根, 不进 out/)。
- ffmpeg 合成 `out/<slug>.mp4` (`-r 30 -pix_fmt yuv420p`); slug 用内容主题。
- 可选再导 `out/<slug>.gif` (前 ~6s, palettegen/paletteuse 优化)。
- BGM (可选): 用户提供了背景音乐 (自带文件 / 指明免版税来源) 时, 用 ffmpeg 混入一轨 (压到 -18~-12dB, `-shortest`)。**不要**自行下载来路不明 / 版权不清的音频。
- 渲染完清理临时帧/脚本。

【交付】
- `out/<slug>.mp4` 必出。回复正文只打印中文小结 + 产物文件名, 不要贴日志/二进制。
- 缺 ffmpeg/playwright 时, 在小结里明确说明缺哪个。
