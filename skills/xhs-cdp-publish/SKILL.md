---
name: xhs-cdp-publish
description: Automate Xiaohongshu creator publishing via Chrome DevTools Protocol (CDP). Use when you need to click "上传图文", upload images, fill content, and click "发布" on https://creator.xiaohongshu.com/publish/publish?source=official using the bundled Node scripts.
---

# XHS CDP Publish

## Overview
Use the bundled Node scripts to drive Xiaohongshu creator publishing through CDP on an existing, logged-in Edge/Chrome session.

## Workflow
1. Start a browser with CDP enabled
- Edge/Chrome must be launched with `--remote-debugging-port=9222`.
- Make sure you are logged in and on the publish page.

2. Upload image + fill content
- Run the upload script with CLI args for content and image.
- Supported args:
  - `--content "..."`
  - `--image "/abs/path.jpg"` or `--image "https://..."`

Example:
```bash
node /Users/majia/.codex/skills/xhs-cdp-publish/scripts/mj_xhs_cdp_upload.js \
  --content "你的文案" \
  --image "https://example.com/image.jpg"
```

3. Click publish
```bash
node /Users/majia/.codex/skills/xhs-cdp-publish/scripts/mj_xhs_click_publish.js
```

## Notes
- Scripts assume CDP port `9222` and the publish URL.
- If the page is not found, the scripts may open a new publish tab; ensure it is logged in.

## Resources
### scripts/
- `mj_xhs_cdp_upload.js`: click “上传图文”, upload image, fill content.
- `mj_xhs_click_publish.js`: click “发布”.
