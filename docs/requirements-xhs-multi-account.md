# 多账号 + 多浏览器 Profile 同步需求文档

## 背景
当前 WechatSync CLI 通过 Chrome 扩展连接 MCP Server 进行多平台同步，但仅支持单个浏览器环境和单账号。用户希望通过多个 Chrome profile 管理多个账号，并实现“一键发布多平台及多账号”。

## 目标
1. 支持多账号：每个账号绑定一个独立 Chrome profile（例如 `chrome --user-data-dir=profiles/account1`）。
2. CLI 支持多账号配置与一键同步：单次命令可以向多个账号、多个平台发布内容。
3. 支持为每个账号配置独立 Chrome DevTools 端口，避免冲突。
4. 微信公众号发布使用外部脚本（本地 Python 脚本），由 CLI 独立命令触发。

## 范围
- CLI 增加多账号配置与同步能力。
- CLI 基于 Chrome DevTools MCP 连接浏览器。

## 非目标
- 不新增或实现任何新平台适配器。
- 平台登录与发布过程需由用户手动完成。
- 不处理平台反爬、登录、验证码等问题。

## 关键约束
- 每个 Chrome profile 对应一个账号，并通过 **唯一 DevTools 端口** 连接。
- CLI 多账号同步依赖账号配置文件（JSON）。
- 目标平台（多账号同步）：小红书、知乎、B站、今日头条、抖音。

## 用户流程
1. 用户为每个账号准备一个 Chrome profile，并登录对应平台账号。
2. 在账号配置中为每个 profile 设置独立的 `chrome.devtoolsPort`。
3. 使用 CLI 多账号同步命令，一键发布到多个平台和多个账号。

## CLI 账号配置文件
默认路径：`~/.wechatsync/accounts.json`

示例：
```json
{
  "accounts": [
    {
      "id": "account1",
      "name": "账号A",
      "platforms": ["zhihu", "juejin"],
      "chrome": { "userDataDir": "profiles/account1", "devtoolsPort": 9222 }
    },
    {
      "id": "account2",
      "name": "账号B",
      "platforms": ["weibo"],
      "chrome": { "userDataDir": "profiles/account2", "devtoolsPort": 9223 }
    }
  ]
}
```

字段说明：
- `id`：账号唯一标识。
- `platforms`：该账号默认发布平台列表（可被 CLI `--platforms` 覆盖）。
- `chrome.userDataDir`：Chrome profile 的 `--user-data-dir` 路径。
- `chrome.devtoolsPort`：必填，Chrome DevTools 远程调试端口（便于连接 Chrome DevTools MCP）。

## CLI 命令
- 单账号模式（保持兼容）：
  ```bash
  wechatsync sync article.md --platforms zhihu,juejin
  ```

- 多账号模式（默认使用账号内 platforms）：
  ```bash
  wechatsync sync article.md --accounts account1,account2
  ```

- 使用全部账号：
  ```bash
  wechatsync sync article.md --all-accounts
  ```

- 多账号 + 启动浏览器 profiles：
  ```bash
  wechatsync sync article.md --accounts account1,account2 --launch-profiles
  ```

- 微信公众号（使用本地脚本）：
  ```bash
  wechatsync wechat --script ~/Downloads/wechat.py
  ```

## 验收标准
1. 在多个 Chrome profile 中启用 MCP，并设置不同端口后，CLI 能同时连接并对多个账号发起同步请求。
2. CLI 可通过 `--accounts` 一次执行多账号同步，输出每个账号的同步结果。
3. 扩展设置中可配置 MCP Server URL，保存后生效并重连。

## 风险与注意事项
- 多账号同步需要多个端口，端口冲突将导致连接失败。
- 如果账号未登录或平台限制访问，扩展侧会返回失败。
