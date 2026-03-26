# 外部项目分析汇总（完整版）

本文件汇总当前调研过的外部项目/程序/扩展，并给出对本分支的需求差距。

## 1. Wechatsync 上游
- README: https://github.com/wechatsync/Wechatsync?tab=readme-ov-file

**关键信息**
- 扩展驱动的同步工作流
- 内置 Markdown 编辑/预览与网页正文提取
- 本地 Markdown 文件同步
- WordPress/XMLRPC 兼容发布

**对本分支的需求差距**
- 缺少 WordPress/XMLRPC 兼容发布入口
- 缺少内置 Markdown 编辑器（仍以 CLI + 扩展为主）
- 本分支强调多账号多 profile，但缺少上游的“编辑器一体化体验”

## 2. Article Sync JS SDK
- 仓库: https://github.com/wechatsync/article-syncjs

**关键信息**
- 提供网页端 SDK（`window.syncPost(...)`）
- 支持 CDN 引用，便于第三方 CMS/前端页面直接触发同步

**对本分支的需求差距**
- 缺少可嵌入网页的 SDK 触发同步能力
- 不支持从第三方前端直接发起同步任务

## 3. JustOneAPI Python SDK
- 仓库: https://github.com/justoneapi/justoneapi-python

**关键信息**
- 统一数据 API SDK
- 基于 token 的多平台结构化数据获取

**对本分支的需求差距**
- 缺少统一第三方数据 API 集成层
- 仍依赖浏览器侧 cookies 与平台适配器

## 4. MultiPost 桌面应用
- 分析文档：`analysis/multipost_analysis.md`

**关键信息**
- Electron 桌面端
- SQLite 持久化（账号/草稿/发布历史/定时任务）
- 多账号隔离通过 `session_partition`
- BrowserView + JS 注入驱动发布

**对本分支的需求差距**
- 本分支未提供桌面端多账号 UI 与数据库管理
- 缺少 publish group 的可视化管理能力

## 5. OpenWrite 扩展
- 分析文档：`analysis/openwrite_2.1.18_analysis.md`

**关键信息**
- MV3 扩展
- 背景会话自动创建
- 平台脚本按功能拆分：publisher / success / stats

**对本分支的需求差距**
- 缺少“网页侧 SDK 检测/桥接”能力
- 缺少统一 stats 采集与回传闭环

---

## 本分支现状总结
- 强项：多账号多 profile + MCP + CLI 自动化
- 弱项：缺少内置编辑器、网页 SDK、统一数据 API 层
- 后续方向：
  1) 补充网页端 SDK
  2) 提升数据/API 统一抽象层
  3) 逐步完善多账号可视化管理
