---
name: video-narrated
zh_name: "带解说短片"
en_name: "Narrated Video"
emoji: "🎙️"
description: "把内容做成带配音 + 字幕的短视频 (MP4 + SRT): agent 生成动画 → TTS 配音 → ffmpeg 混音"
category: video
scenario: video
aspect_hint: "16:9"
recommended: 6
tags: ["video", "narration", "tts", "mp4"]
example_format: "markdown"
example_name: "带解说短片 示例"
example_tagline: "一段内容 → 带配音的 MP4"
---

【Skill: 带解说短片 Narrated Video】
【意图】把【用户内容】做成一支带**配音 + 字幕**的 1920×1080 短视频。运行在 pipeline 模式 (你可用 Bash/playwright/ffmpeg, 产物写 out/)。

【步骤】
1. 按【用户内容】生成一个 1920×1080 单文件动画 HTML (CSS 时间线; 真实内容; 遵守设计纪律)。
2. 写逐场景**解说脚本** (中文, 节奏与各场景时长匹配)。
3. **配音 (优雅降级)**: 读环境变量 `TTS_API_KEY`。
   - 若非空: 用 `POST $TTS_ENDPOINT` (OpenAI-兼容 `/audio/speech`; header `Authorization: Bearer $TTS_API_KEY`; JSON body `{"model": "$TTS_MODEL", "voice": "$TTS_VOICE", "input": "<该段脚本>"}`; `TTS_MODEL`/`TTS_VOICE` 缺省时给合理默认) 逐段合成配音音频 (mp3/wav)。
   - 若 `TTS_API_KEY` 为空: **跳过配音**, 产出无声视频, 并在最后小结里提示「在 Settings → TTS 配置密钥后可加配音」。
4. **字幕**: 由解说脚本 + 时间线生成 `out/<slug>.srt`。
5. **渲染**: playwright 无头逐帧抓取动画 → ffmpeg 合成视频; 若有配音, 用 ffmpeg 把配音轨混入 (`-map` 视频流 + 音频流, `-shortest`) → `out/<slug>.mp4`。
6. 清理临时帧/脚本/音频中间件。

【交付】
- `out/<slug>.mp4` (有 key 则带配音) + `out/<slug>.srt` 必出。
- 回复正文只打印中文小结 + 产物文件名; **绝不**打印 `TTS_API_KEY` / 二进制 / 整段日志。

【安全】
- `TTS_API_KEY` 只用于调用 TTS 接口, 不要回显、不要写进任何产物文件、不要打印。
