# OpenWrite 2.1.18 — 结构与代码分析

## 基本信息
- 路径: `/Users/majia/Downloads/openwrite_2.1.18 `
- 类型: Chrome 扩展（Manifest V3）
- 名称: OpenWrite
- 版本: 2.1.18

## 目录结构（顶层）
```
openwrite_2.1.18 /
  _metadata/
  background.js
  config/
    env.js
  content-scripts/
    common/
    publishers/
    success-reporters/
    stats-collectors/
  icons/
  images/
  manifest.json
  package.json
  popup/
    popup.html
    popup.js
    popup.css
```

## 核心组件
- **background.js**
  - Service Worker 入口。
  - 维护 OpenWrite 会话 `openwrite_session`（保存在 `chrome.storage.local`）。
  - 自动创建会话流程：已有 session 校验 → 尝试在 OpenWrite 标签页创建 → 无则后台打开隐藏标签页创建。
  - 主要接口：`/api/ext/auth/me`、`/api/ext/auth/create-chrome-session`。

- **config/env.js**
  - 环境配置（development / production）。
  - 生产 API 基址：`https://openwrite.cn`。
  - 通过 `OpenWriteConfig.getApiUrl()` 拼接 API。

- **content-scripts/common/common.js**
  - 注入全局标识 `window.__OPENWRITE_EXTENSION__` 供网页检测。
  - 监听页面消息 `OPENWRITE_EXTENSION_DETECT` → 回发响应。
  - 提供全局 `showNotification()` 供成功回调提示。
  - 管理 SPA 路由跳转与自动填充逻辑（监听 DOM 变化）。

- **content-scripts/common/publications-bridge.js**
  - 在 OpenWrite 发布记录页做消息桥。
  - 接收页面 `openwrite_collect_stats_silent` → 转发给 background → 回传统计结果。

- **content-scripts/publishers/**
  - 针对各平台编辑页注入发布逻辑（掘金、CSDN、知乎、博客园、腾讯云、51CTO、思否、开源中国、ITPUB、头条、InfoQ、B 站等）。

- **content-scripts/success-reporters/**
  - 发布完成页面回报成功状态。

- **content-scripts/stats-collectors/**
  - 文章页统计采集（阅读数、点赞、收藏等）。

- **popup/**
  - 扩展弹窗 UI + 平台登录检测逻辑。
  - `popup.js` 内维护平台配置列表（登录检测 URL、登录页 URL、图标、重定向判断等）。

## Manifest 与权限
- `manifest_version: 3`
- `permissions`: `activeTab`, `storage`, `scripting`, `tabs`
- `host_permissions`: 覆盖 OpenWrite 域名与各平台编辑/发布/统计页面（掘金、CSDN、知乎、博客园、腾讯云、51CTO、思否、开源中国、ITPUB、头条、InfoQ、B 站等）。

## 与 OpenWrite 后端的交互
- 获取/校验会话：`/api/ext/auth/me`
- 创建 Chrome 会话：`/api/ext/auth/create-chrome-session`
- 会话存储：`chrome.storage.local` 的 `openwrite_session`

## 结论与可复用点
- **扩展结构清晰**：background + content scripts + popup 三层。
- **平台驱动模型**：按平台拆分 publisher / success-reporter / stats-collector。
- **核心能力**：
  - 自动建立 OpenWrite 会话
  - 按平台填充发布页面
  - 成功回调与数据统计

## 备注
- `package.json` 显示打包脚本基于 `build.js`，但该脚本不在该目录内（可能在源码仓库）。
