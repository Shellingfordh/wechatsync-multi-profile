# 多账号多 Profile + 每账号不同内容 — 开发需求

## 目标
1. 支持 **每个账号不同内容文件** 的同步。
2. 支持 **多平台 + 多账号 + 多 profile** 的组合发布。
3. 不改动现有 cookie/登录逻辑，继续依赖 Chrome profile 的隔离能力。
4. 保持 MCP 端口隔离与 Token 校验机制。

## 范围
- CLI 层新增内容映射能力（账号 → 内容文件/标题/封面/平台）。
- 文档与测试流程完善（多 profile 多账号测试矩阵）。
- 不新增平台适配器（沿用现有适配器）。

## 非目标
- 不自动登录/验证码/扫码。
- 不注入或篡改 cookies。
- 不修改核心存储结构（除非已有字段可选扩展）。

## 需求细化
### 1) 内容映射
新增账号内容映射文件（JSON），支持按账号指定内容：
```json
{
  "accounts": {
    "accountA": {
      "file": "./contents/a.md",
      "title": "A 自定义标题",
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

- CLI 增加 `--content-map <path>` 读取该文件。
- 优先级：`content-map > accounts.json content > CLI 默认 file`。

### 2) 平台覆盖逻辑
- 若 content-map 内指定 `platforms`，优先使用该列表。
- 否则沿用现有 `--platforms` 或 `accounts.json` 中平台设置。

### 3) 多 profile 运行
- 保持 `--launch-profiles` 与 `--wait-login` 行为。
- 多账号同时运行时要求端口唯一（现有 `ensureUniquePorts`）。

### 4) Cookie/指纹隔离
- 仍由 Chrome profile 负责隔离。
- CLI 不做 cookie 注入。
- 在测试文档中强调 profile 唯一性。

## 验收标准
- 在多账号模式下，每个账号可读取独立内容文件并成功同步。
- 同一账号可同步多个平台；不同账号之间内容互不影响。
- cookie 与登录状态完全由 profile 管理，不发生串号。
- CLI 输出明确显示每个账号实际使用的内容文件和平台列表。
