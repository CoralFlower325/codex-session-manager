# Codex 会话管理器

本地 Web 应用，用于管理 Codex 桌面端对话历史。支持浏览、搜索、删除、导出对话记录，新对话生成时自动实时刷新。

## 功能

- **浏览会话** — 以卡片形式展示所有本地 Codex 对话（活跃 + 归档）
- **实时搜索** — 按标题过滤，即时响应
- **查看详情** — 点击卡片进入对话详情，查看完整聊天记录
- **删除会话** — 单条或批量删除（带确认弹窗 + 粒子消散动画）
- **导出** — 支持 Markdown 和 JSON 格式导出
- **实时监听** — WebSocket + chokidar 自动检测新对话并刷新列表
- **跨平台** — macOS / Windows 通用

## 快速开始

```bash
npm install
npm start
```

浏览器访问 http://localhost:3210

## 技术栈

- **后端** — Express + WebSocket (ws) + chokidar
- **前端** — 原生 HTML / CSS / JavaScript（ES Modules）
- **设计** — 暗色玻璃拟态，渐变光晕背景，丰富动画交互

## 项目结构

```
codex-session-manager/
├── server.js              # 后端服务
├── package.json
├── .gitignore
├── README.md
├── public/
│   ├── index.html         # 单页应用
│   ├── css/
│   │   └── style.css      # 样式（含动画）
│   └── js/
│       ├── app.js         # 主逻辑
│       ├── api.js          # REST API 客户端
│       ├── ws.js           # WebSocket 客户端
│       ├── render.js       # DOM 渲染
│       └── animations.js   # 动画工具
└── docs/
    └── superpowers/
        └── specs/          # 设计文档
```

## 工作原理

应用读取 `~/.codex/sessions/` 和 `~/.codex/archived_sessions/` 目录下的对话文件，通过 `session_index.jsonl` 匹配标题，解析 JSONL 文件提取消息内容。

## 许可证

MIT
