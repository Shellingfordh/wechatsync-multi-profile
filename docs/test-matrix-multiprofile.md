# 多账号多 Profile 测试矩阵

## 前置条件
- 每个账号使用独立 Chrome profile。
- profile 中安装并启用 WeChatSync 扩展。
- 每个 profile 设置独立 MCP Server URL 与 Token。
- `accounts.json` 配置端口与 token。

## 推荐命令
### 1) 启动并等待登录
```bash
wechatsync sync sample.md --all-accounts --launch-profiles --wait-login --dry-run
```

### 2) 多账号多内容同步
```bash
wechatsync sync base.md --all-accounts --content-map ~/.wechatsync/contents.json
```

## 测试维度
- 账号：A/B/C
- 平台：本 repo 已支持平台列表
- 内容文件：每账号独立文件
- Profile：`--user-data-dir` 唯一

## 通过标准
- 每账号内容正确填充到目标平台。
- 平台登录状态不串号。
- CLI 输出显示正确账号/内容/平台组合。
- 发布失败场景能准确回报错误。
