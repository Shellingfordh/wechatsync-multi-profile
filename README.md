# Wechatsync Multi-Profile Fork

EN | 中文  [WeChatSync 现状功能分析](https://github.com/Shellingfordh/wechatsync-multi-profile/blob/v2/docs/analysis-current.md#wechatsync-%E7%8E%B0%E7%8A%B6%E5%8A%9F%E8%83%BD%E5%88%86%E6%9E%90)

---

## English

A multi-account, multi-Chrome-profile fork of Wechatsync focused on **manual login** and **safe, user-controlled publishing**.

### What’s added in this fork
- **Multi-account sync**: one command can sync to multiple accounts and platforms.
- **Per-account content**: map different content files for different accounts.
- **Per-account Chrome profiles**: each account uses its own `--user-data-dir`.
- **Per-account Chrome DevTools ports** for Chrome DevTools MCP access.
- **Manual login flow**: CLI can open profiles and wait for you to complete login/verification.
- **WeChat Official Account script runner**: run your local `wechat.py` from CLI.
 
Supported platforms (MVP): Xiaohongshu, Zhihu, Bilibili, Toutiao, Douyin.

### Safety model
- No automatic login.
- No automated captcha/2FA handling.
- No cookie injection.
- All sensitive steps are performed by the user in the browser.

### Quick start
1. Create a Chrome profile per account (unique `--user-data-dir`).
2. Add `chrome.devtoolsPort` for each account in `~/.wechatsync/accounts.json`.
3. Launch profiles and log in once (login state is preserved in the profile).
4. Sync:

```bash
node packages/cli/dist/index.js sync article.md --all-accounts --launch-profiles --wait-login
```

### Accounts file
Default location: `~/.wechatsync/accounts.json`

```json
{
  "accounts": [
    {
      "id": "zhihu_1",
      "name": "Zhihu-1",
      "platforms": ["zhihu"],
      "chrome": { "userDataDir": "profiles/zhihu_1", "devtoolsPort": 9222 }
    }
  ]
}
```

### WeChat Official Account script
```bash
node packages/cli/dist/index.js wechat --script ~/Downloads/wechat.py
```

### Docs
- Manual login & testing: `docs/manual-user-behavior-testing.md`
- Multi-account requirements: `docs/requirements-xhs-multi-account.md`
- Codex prompt templates: `docs/codex-prompt-templates.md`
- Current state analysis: `docs/analysis-current.md`
- External projects analysis: `docs/external-projects-analysis.md`

### Utilities (Xiaohongshu CDP)
Bundled helper scripts for Xiaohongshu CDP automation are available under `artifacts/`:
- `artifacts/mj_xhs_cdp_upload.js` (click “上传图文”, upload image, fill content)
- `artifacts/mj_xhs_click_publish.js` (click “发布”)
- `artifacts/xhs_cdp_scripts.zip` (zip bundle of the above)

Notes:
- These scripts assume a running Edge/Chrome with `--remote-debugging-port=9222`.
- Use them on the creator publish page: `https://creator.xiaohongshu.com/publish/publish?source=official`.
- `mj_xhs_cdp_upload.js` supports args:
  - `--content "..."` to set text
  - `--image "/abs/path.jpg"` or `--image "https://..."` to set image

### Analysis (external references)
- MultiPost app bundle analysis: `analysis/multipost_analysis.md`
- OpenWrite extension analysis: `analysis/openwrite_2.1.18_analysis.md`
- Wechatsync (upstream) README: `https://github.com/wechatsync/Wechatsync?tab=readme-ov-file`
- Article Sync JS SDK: `https://github.com/wechatsync/article-syncjs`
- JustOneAPI Python SDK: `https://github.com/justoneapi/justoneapi-python`

### External project gaps vs this fork
- **wechatsync/Wechatsync** emphasizes a browser extension workflow with markdown editing, web content extraction, local markdown sync, and WordPress XMLRPC compatibility.  
  Gap for this fork: we do not expose a WordPress/XMLRPC compatible publishing endpoint or a built‑in markdown editor; focus remains on CLI + Chrome DevTools MCP.
- **wechatsync/article-syncjs** provides a web SDK (`window.syncPost(...)`) and CDN‑hosted assets to trigger sync from a webpage.  
  Gap for this fork: no web‑page SDK hook to launch sync tasks from third‑party CMS/frontends.
- **justoneapi/justoneapi-python** is a data API SDK for retrieving structured data from many platforms via token‑based API calls.  
  Gap for this fork: no unified third‑party data API integration layer (we rely on browser‑side cookies and platform adapters instead of API tokens).

### License
GPL-3.0. See `LICENSE`.

---

## 中文说明

这是 Wechatsync 的多账号多 Profile 版本，强调**手动登录**与**用户可控发布**。

### 本分支新增能力
- **多账号同步**：一次命令可发布多个账号与多个平台。
- **每账号不同内容**：支持为不同账号指定不同内容文件。
- **多 Chrome Profile**：每个账号独立 `--user-data-dir`。
- **每账号 Chrome DevTools 端口**，便于 Chrome DevTools MCP 连接。
- **手动登录流程**：CLI 可打开 profile 并等待你完成登录/验证。
- **公众号脚本**：CLI 直接运行本地 `wechat.py`。

支持平台（MVP）：小红书、知乎、B站、头条、抖音。

### 安全与合规
- 不自动登录。
- 不自动处理验证码/二次验证。
- 不注入 cookies。
- 所有敏感步骤由用户在浏览器中完成。

### 快速开始
1. 为每个账号创建独立 Profile（不同 `--user-data-dir`）。
2. 在 `~/.wechatsync/accounts.json` 为每个账号配置 `chrome.devtoolsPort`。
3. 启动 profile 并完成一次登录（登录态保存在 profile）。
4. 一键同步：

```bash
node packages/cli/dist/index.js sync article.md --all-accounts --launch-profiles --wait-login
```

### 账号配置文件
默认路径：`~/.wechatsync/accounts.json`

```json
{
  "accounts": [
    {
      "id": "zhihu_1",
      "name": "知乎-1",
      "platforms": ["zhihu"],
      "chrome": { "userDataDir": "profiles/zhihu_1", "devtoolsPort": 9222 }
    }
  ]
}
```

### 公众号脚本
```bash
node packages/cli/dist/index.js wechat --script ~/Downloads/wechat.py
```

### 文档
- 手动登录与测试：`docs/manual-user-behavior-testing.md`
- 多账号需求：`docs/requirements-xhs-multi-account.md`
- Codex 提示词模板：`docs/codex-prompt-templates.md`
- 现状分析：`docs/analysis-current.md`
- 外部项目分析汇总：`docs/external-projects-analysis.md`

### 工具脚本（小红书 CDP）
小红书 CDP 辅助脚本位于 `artifacts/`：
- `artifacts/mj_xhs_cdp_upload.js`（点击“上传图文”、上传图片、填写文案）
- `artifacts/mj_xhs_click_publish.js`（点击“发布”）
- `artifacts/xhs_cdp_scripts.zip`（上述脚本打包）

说明：
- 需要浏览器以 `--remote-debugging-port=9222` 启动。
- 目标页面：`https://creator.xiaohongshu.com/publish/publish?source=official`。
- `mj_xhs_cdp_upload.js` 支持参数：
  - `--content "..."` 设置文案
  - `--image "/绝对路径.jpg"` 或 `--image "https://..."` 设置图片

### 外部项目分析
- MultiPost 桌面应用分析：`analysis/multipost_analysis.md`
- OpenWrite 扩展分析：`analysis/openwrite_2.1.18_analysis.md`
- Wechatsync 上游 README：`https://github.com/wechatsync/Wechatsync?tab=readme-ov-file`
- Article Sync JS SDK：`https://github.com/wechatsync/article-syncjs`
- JustOneAPI Python SDK：`https://github.com/justoneapi/justoneapi-python`

### 与本分支的需求差距
- **wechatsync/Wechatsync** 提供浏览器扩展工作流、Markdown 编辑器、网页正文提取、本地 Markdown 同步，以及 WordPress XMLRPC 兼容发布方式。  
  本分支缺口：未提供 WordPress/XMLRPC 兼容发布入口，也未内置 Markdown 编辑器（仍以 CLI + Chrome DevTools MCP 为主）。
- **wechatsync/article-syncjs** 提供网页 SDK（`window.syncPost(...)`）并支持 CDN 引用。  
  本分支缺口：缺少可嵌入第三方 CMS/前端页面的网页 SDK 触发同步。
- **justoneapi/justoneapi-python** 提供 token 认证的数据 API SDK，可通过统一接口获取多平台结构化数据。  
  本分支缺口：没有统一第三方数据 API 集成层，仍依赖浏览器侧 cookies 与平台适配器。

### 许可证
GPL-3.0，见 `LICENSE`。
