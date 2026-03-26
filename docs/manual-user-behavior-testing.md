# 模拟用户行为（手动）测试文档

> 目的：保证所有登录、验证码、发布动作均由**真实用户手动完成**，系统仅负责启动 profile、连接 Chrome DevTools MCP、触发同步与状态展示。避免任何自动化登录/绕过行为。

## 原则
- **不自动填写账号/密码**。
- **不自动处理验证码、短信验证、扫码登录**。
- **不自动注入或篡改 cookies**。
- 仅使用浏览器自身的 profile 机制持久化登录状态。

## 准备工作
1. 为每个账号创建独立 Chrome profile：
   - 例：`--user-data-dir=profiles/account1`
2. 在 CLI 账号配置文件中填写 `chrome.devtoolsPort`（每个账号一个端口）。
3. CLI 启动 profile 时会自动带 `--remote-debugging-port`，Chrome DevTools MCP 将连接该端口进行同步。

## 手动登录步骤（每个账号）
1. 使用 CLI 启动 profile：
   ```bash
   wechatsync sync article.md --all-accounts --launch-profiles --wait-login --dry-run
   ```
2. 切到对应浏览器窗口，在目标平台完成登录。
3. 登录完成后，回到 CLI 执行真实同步命令。

## 手动发布验证
1. CLI 同步触发后，在浏览器中观察：
   - 平台是否出现草稿/发布页面。
   - 页面是否显示保存成功或草稿已生成。
2. 如果平台要求二次确认或补全字段：
   - 由用户在页面中手动确认并提交。
3. 完成后，检查 CLI 输出的链接或草稿状态。

## 微信公众号（脚本方式）
- 脚本路径示例：
  ```bash
  wechatsync wechat --script ~/Downloads/wechat.py
  ```
- 由脚本自行处理素材上传/草稿创建/推送逻辑。

## 常见问题排查
- **Chrome DevTools MCP 无法连接**：
  - 确认启动时带了 `--remote-debugging-port`。
  - 端口是否被占用。
- **登录状态丢失**：
  - 是否误用了相同 profile。
  - 是否清理了浏览器数据。
- **同步失败**：
  - 平台未登录。
  - 页面 UI 变化导致适配器失败（需更新适配器）。

## 安全与合规
- 所有高风险行为（登录、验证码、发布确认）都由用户执行。
- 系统不保存账号密码，不自动注入 cookies。
- 若平台策略变化，优先提示用户手动完成并反馈错误。
