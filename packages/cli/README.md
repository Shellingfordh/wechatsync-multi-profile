# @wechatsync/cli

命令行同步文章到多个内容平台。

## 安装

```bash
npm install -g @wechatsync/cli
```

## 快速开始

```bash
# 同步文章到知乎和掘金
wechatsync sync article.md --platforms zhihu,juejin
```

首次使用会提示安装 Chrome 扩展 - 访问 https://wechatsync.com/#install 安装。

## 命令

### sync - 同步文章

```bash
# 基本用法
wechatsync sync article.md -p zhihu,juejin

# 指定标题
wechatsync sync article.md -t "我的文章" -p zhihu

# 添加封面
wechatsync sync article.md -p juejin --cover https://example.com/cover.jpg

# 多账号不同内容
wechatsync sync base.md --all-accounts --content-map ~/.wechatsync/contents.json

# 预览（不实际同步）
wechatsync sync article.md --dry-run
```

### platforms - 查看平台

```bash
# 列出所有平台
wechatsync platforms

# 显示登录状态
wechatsync platforms --auth
wechatsync ls -a
```

### auth - 检查登录

```bash
# 检查所有平台
wechatsync auth

# 检查单个平台
wechatsync auth zhihu

# 强制刷新
wechatsync auth --refresh
```

### extract - 提取文章

```bash
# 从浏览器当前页面提取
wechatsync extract

# 保存到文件
wechatsync extract -o article.md
```

## 工作原理

```
┌──────────────┐     WebSocket     ┌───────────────────┐
│  wechatsync  │◄─────────────────►│  Chrome Extension │
│    (CLI)     │    port 9527      │   (同步助手)       │
└──────────────┘                   └───────────────────┘
                                            │
                                            ▼
                                   ┌───────────────────┐
                                   │  目标平台 API      │
                                   │  (知乎/掘金/...)   │
                                   └───────────────────┘
```

CLI 启动后监听 WebSocket 端口，等待 Chrome 扩展连接。
扩展连接后，CLI 通过 WebSocket 发送请求，扩展执行实际的平台 API 调用。

## 支持的平台

知乎、掘金、简书、头条、微博、B站、百家号、CSDN、语雀、豆瓣、搜狐、雪球、微信公众号、人人都是产品经理、大鱼号、一点资讯、51CTO、搜狐焦点、慕课网、开源中国、思否、博客园

## 多账号内容映射（可选）

`--content-map` 支持为每个账号指定不同的内容文件/标题/封面/平台：

```json
{
  "accounts": {
    "accountA": {
      "file": "./contents/a.md",
      "title": "A 标题",
      "cover": "./covers/a.png",
      "platforms": ["zhihu", "juejin"]
    },
    "accountB": {
      "file": "./contents/b.md",
      "platforms": ["weibo"]
    }
  }
}
```

示例文件：`docs/content-map.example.json`

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SYNC_WS_PORT` | WebSocket 端口 | 9527 |
| `WECHATSYNC_TOKEN` | 安全验证 token | - |

## Claude Code 集成

安装 Skill 插件：

```bash
/plugin marketplace add wechatsync/Wechatsync
/plugin install wechatsync
```

然后在 Claude Code 中可以直接说：
- "把这篇文章同步到掘金"
- "帮我看看哪些平台已登录"
- "从浏览器提取当前文章"

## License

MIT
