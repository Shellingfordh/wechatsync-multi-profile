# 多 Profile 全平台联调结果汇总

## 结论
- **尚未执行真实联调**（需要用户在各 profile 手动登录并确认发布）。
- 当前已完成：测试矩阵与执行步骤文档、CLI 支持每账号不同内容。

## 为什么未执行
- 联调需要多账号真实登录、验证码处理、手动确认发布。
- 这些步骤必须由用户在浏览器中完成，自动化不可替代。

## 可执行步骤（请你操作）
1. 准备账号与 profile：每个账号独立 `--user-data-dir`。
2. 在每个 profile 内安装扩展并配置 MCP URL + Token。
3. 启动并等待登录：
   ```bash
   wechatsync sync sample.md --all-accounts --launch-profiles --wait-login --dry-run
   ```
4. 执行多账号多内容同步：
   ```bash
   wechatsync sync base.md --all-accounts --content-map ~/.wechatsync/contents.json
   ```

## 需要你回传的信息
- 每个账号、每个平台的最终状态（成功/失败/草稿）
- 失败时的 CLI 报错和网页提示
- 平台页面跳转是否正常

我拿到这些后会补齐最终联调结果并给出修复项清单。
