# WeChatSync 现状功能分析

## 组件结构
- `packages/cli`：命令行入口，负责读取内容、启动 Chrome profiles、连接 MCP Server 并分发同步请求。
- `packages/extension`：Chrome 扩展，负责登录检测、平台适配器调用、cookie 访问、MCP WebSocket 客户端。
- `packages/mcp-server`：WebSocket Bridge，CLI 与扩展的通信桥。支持多端口、多实例模式。
- `packages/core`：平台适配器实现（API 调用、内容预处理、图床上传等）。

## 同步流程
1. CLI 读取内容文件（Markdown/HTML），提取标题与正文。
2. CLI 连接 MCP Server（默认 `ws://localhost:9527`，支持多端口）。
3. 扩展连接 MCP Server 并处理请求：
   - 读取/写入 cookies
   - 调用对应平台适配器 API
   - 返回草稿或发布结果

## 多账号能力
- CLI 支持 `~/.wechatsync/accounts.json` 多账号配置。
- 每个账号可指定独立 MCP 端口、Token、Chrome profile。
- CLI 支持 `--launch-profiles` 启动多个 Chrome profile。

## 每账号不同内容
- CLI 已支持 `--content-map <path>`，为每个账号指定独立内容文件/标题/封面/平台覆盖。
- 示例文件：`docs/content-map.example.json`。

## Cookie 与隔离机制
- **不注入或篡改 cookies**，完全依赖浏览器 profile 自身的持久化。
- 多账号隔离通过 **独立 Chrome profile** 完成（`--user-data-dir` + `--profile-directory`）。
- 扩展在每个 profile 内独立存储 MCP token 与 serverUrl。

## MCP 连接
- 扩展支持 MCP 开关、Token 生成与 Server URL 配置（默认 `ws://localhost:9527`）。
- CLI 可按账号配置端口与 token，多端口并行。

## 已支持平台
来自适配器注册（`packages/extension/src/adapters/index.ts`）：
- 知乎、掘金、简书、头条、微博、B站、百家号、CSDN、语雀、豆瓣、搜狐、雪球、微信公众号、人人都是产品经理、大鱼号、一点资讯、51CTO、搜狐焦点、慕课网、开源中国、思否、博客园、东方财富

## 现有短板
- 多 profile 全平台联调仍需手动登录/验证码确认，结果待补齐。
- 多账号批量发布的可观测性有限（当前以 CLI 输出为主）。
