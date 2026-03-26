# MultiPost (macOS app bundle) — 结构与代码分析（已解包）

## 基本信息
- 路径: `/Users/majia/Downloads/multipost Contents`
- 类型: macOS App Bundle（Electron）
- 可执行文件: `MacOS/MultiPost`（arm64）
- Bundle ID: `com.multipost.desktop`
- 版本: `0.1.5`
- 最低系统: macOS 11.0

## App Bundle 结构
```
multipost Contents/
  Info.plist
  MacOS/MultiPost
  Resources/
    app.asar
    app.asar.unpacked/
    app-update.yml
    icon.icns
```

## app.asar 解包结构
解包目录: ` /Users/majia/.ironclaw/workspace/wechatsync/analysis/multipost_asar`
```
app.asar/
  package.json
  out/
    main/index.js
    preload/index.js
    preload/webview.js
    renderer/index.html
    renderer/assets/*
  node_modules/*
  scripts/*
```

## package.json 关键信息
- 入口: `./out/main/index.js`
- 主要依赖:
  - Electron 工具链: `@electron-toolkit/preload`, `@electron-toolkit/utils`
  - UI: `@heroui/react`, `@radix-ui/*`, `framer-motion`, `lucide-react`, `next-themes`
  - 数据: `better-sqlite3`, `electron-store`
  - 更新: `electron-updater`
  - 状态: `zustand`

## 主进程（out/main/index.js）
### 平台定义
内置平台列表 `PLATFORMS`，覆盖：
- 国内：微博、小红书、抖音、B站、知乎、公众号、百家号、头条、头条号、视频号、雪球、即刻、快手、V2EX、豆瓣、得到、知识星球等
- 海外：Twitter/X
每个平台包含：`name`、`icon/iconify`、`url`、`loginUrl`、`supportedContentTypes`

### 数据库
- SQLite 路径：`<userData>/data/multipost.db`
- WAL 模式开启
- 主要表：
  - `account_groups`
  - `accounts`
  - `drafts`
  - `publish_history`
  - `scheduled_publish`
  - `publish_tasks`
  - `fingerprint_profiles`
- `accounts` 支持 `group_id / session_partition / is_default` 等字段
- 多数 CRUD 通过 IPC 暴露给渲染进程

### IPC 接口
集中注册大量 `ipcMain.handle`：
- 账号组/账号管理
- BrowserView 管理（open/show/hide/navigate/execute）
- 发布任务、发布历史、草稿、定时发布
- 平台控制与浏览器 Tab 管理
- 更新、文件读写（readFileAsDataURL / getFileInfo）
- 发布 Group（多账号批量提交）

### 浏览器与发布逻辑
- 每个账号使用独立 `session_partition`（用于多账号隔离）
- 通过 `webContents` 注入脚本，控制网页发布流程
- 读取 cookies 来判断登录状态

## Preload
### out/preload/index.js
- 在 `window.api` 暴露完整 IPC API：
  - `account/group/browser/task/publish/platform/executor/app/layout/updater/draft/history/scheduled/publishGroup/keepAlive` 等

### out/preload/webview.js
- 给 WebView 环境注入 `window.multipost` API
- 自建事件系统：`account:login/logout`, `publish:progress/complete/error`, `update:available` 等

## Renderer
- `out/renderer/index.html` 加载打包产物
- CSP 仅允许本地资源与内联样式

## 结论（对 WeChatSync 需求的可借鉴点）
- **多账号隔离**：`session_partition` 为每个账号独立 session
- **本地数据库**：用 SQLite 存储账号、草稿、发布历史、定时任务
- **发布 Group**：多账号批量填充/提交的 IPC 设计已成型
- **BrowserView + executeJavaScript**：通过注入脚本驱动网页发布

如需更深层（例如具体发布脚本与页面定位逻辑），需要继续追踪 `index.js` 中针对各平台的执行片段。
