# Codex 工具清单示例（Prompt 模板）

> 适用于已接入 `wechatsync` MCP Server 的 Codex。工具名以 MCP 注册为准：
> `list_platforms`, `check_auth`, `sync_article`, `extract_article`, `upload_image_file`

## 1) 环境检查
```
请先调用 list_platforms（forceRefresh=true），然后把所有未登录的平台列出来。
```

## 2) 单平台同步（Markdown）
```
将以下 Markdown 内容同步到知乎，保存为草稿：
标题：{TITLE}
正文：
{MARKDOWN_BODY}
```

## 3) 多平台同步（Markdown + 封面）
```
把这篇文章同步到知乎和掘金，封面使用 {COVER_URL}：
标题：{TITLE}
正文：
{MARKDOWN_BODY}
```

## 4) 从当前页面提取并同步
```
先执行 extract_article，然后把提取结果同步到知乎和掘金。
```

## 5) 本地图片上传并替换
```
请用 upload_image_file 上传 /Users/majia/Downloads/cover.png 到 weibo，
然后用返回的 URL 作为封面，同步到知乎。
标题：{TITLE}
正文：
{MARKDOWN_BODY}
```

## 6) 批量平台同步（不同平台）
```
同步到以下平台：zhihu, juejin, csdn, bilibili。
标题：{TITLE}
正文：
{MARKDOWN_BODY}
```

## 7) 登录状态快速检查
```
检查 zhihu 和 juejin 的登录状态（check_auth）。
```

## 8) 失败重试指令
```
如果 sync_article 返回失败，请输出失败平台和错误原因，
并建议我需要手动完成的步骤（如登录/验证码/二次确认）。
```
