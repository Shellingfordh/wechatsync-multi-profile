#!/usr/bin/env node

/**
 * Douyin MCP Server - Playwright 版本
 * 基于 Playwright 模拟浏览器操作实现抖音视频上传
 */

const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 18062;

// Cookie 存储路径
const COOKIE_PATH = path.join(__dirname, 'cookies.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 全局浏览器实例
let browser = null;
let context = null;

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 获取或创建浏览器上下文
async function getContext() {
  if (!browser) {
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // 加载 cookies
    if (fs.existsSync(COOKIE_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
      await context.addCookies(cookies);
    }
  }

  return context;
}

// 保存 cookies
async function saveCookies() {
  if (context) {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  }
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'douyin-mcp',
      timestamp: new Date().toISOString(),
    },
    message: '服务正常',
  });
});

// 检查登录状态
app.get('/api/v1/login/status', async (req, res) => {
  try {
    const ctx = await getContext();
    const page = await ctx.newPage();

    await page.goto('https://creator.douyin.com/creator-micro/content/manage', { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // 检查是否需要登录
    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes('passport') && !currentUrl.includes('login');

    await page.close();

    res.json({
      success: true,
      data: {
        is_logged_in: isLoggedIn,
      },
      message: isLoggedIn ? '已登录' : '未登录',
    });
  } catch (error) {
    res.status(500).json({
      error: '检查登录状态失败',
      code: 'STATUS_CHECK_FAILED',
      details: error.message,
    });
  }
});

// 获取登录二维码
app.get('/api/v1/login/qrcode', async (req, res) => {
  try {
    const ctx = await getContext();
    const page = await ctx.newPage();

    await page.goto('https://sso.douyin.com/', { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // 截图二维码
    await page.screenshot({ path: '/tmp/douyin-login-qrcode.png' });

    res.json({
      success: true,
      data: {
        instructions: [
          '1. 打开抖音 App',
          '2. 点击右上角扫描图标',
          '3. 扫描 /tmp/douyin-login-qrcode.png 中的二维码',
          '4. 在手机上确认登录',
        ],
      },
      message: '请扫描截图中的二维码',
    });

    // 等待登录
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const currentUrl = page.url();
      if (currentUrl.includes('creator')) {
        await saveCookies();
        break;
      }
    }

    await saveCookies();
    await page.close();
  } catch (error) {
    res.status(500).json({
      error: '获取二维码失败',
      code: 'QRCODE_FAILED',
      details: error.message,
    });
  }
});

// 发布视频
app.post('/api/v1/publish', async (req, res) => {
  const { title, content, video_path, tags = [], visibility = 'public' } = req.body;

  // 验证参数
  if (!title || !video_path) {
    return res.status(400).json({
      error: '缺少必要参数',
      code: 'MISSING_PARAMS',
    });
  }

  if (!fs.existsSync(video_path)) {
    return res.status(400).json({
      error: '视频文件不存在',
      code: 'VIDEO_NOT_FOUND',
    });
  }

  try {
    const ctx = await getContext();
    const page = await ctx.newPage();

    // 访问抖音创作者平台
    console.log('访问抖音创作者平台...');
    await page.goto('https://creator.douyin.com/creator-micro/content/upload', { waitUntil: 'domcontentloaded' });
    await sleep(8000);
    console.log('当前URL:', page.url());
    console.log('Frame URLs:', page.frames().map(f => f.url()));

    // 检查是否需要登录
    const currentUrl = page.url();
    if (currentUrl.includes('passport') || currentUrl.includes('login')) {
      await page.close();
      return res.status(401).json({
        error: '未登录',
        code: 'NOT_LOGGED_IN',
        message: '请先登录抖音',
      });
    }

    // 上传视频文件
    console.log('上传视频文件...');
    const tryUpload = async () => {
      const allFrames = page.frames();
      // 优先用 filechooser 流程
      for (const f of allFrames) {
        try {
          const uploadBtn = f.getByText(/上传|点击上传|发布|开始创作|进入/).first();
          if (await uploadBtn.count()) {
            try {
              const fcPromise = page.waitForEvent('filechooser', { timeout: 8000 });
              await uploadBtn.click({ timeout: 2000 });
              const fc = await fcPromise;
              await fc.setFiles(video_path);
              return true;
            } catch {
              // ignore timeout and continue fallback
            }
          }
        } catch {}
      }

      // 回退：直接找 input[type=file]（含 shadow DOM）
      for (const f of allFrames) {
        try {
          const input = f.locator('input[type="file"]').first();
          if (await input.count()) {
            await input.setInputFiles(video_path);
            return true;
          }
          // shadow DOM scan
          const handle = await f.evaluateHandle(() => {
            const inputs = [];
            const walk = (node) => {
              if (!node) return;
              if (node.nodeType === 1) {
                if (node.tagName === 'INPUT' && node.type === 'file') inputs.push(node);
                if (node.shadowRoot) walk(node.shadowRoot);
              }
              const children = node.children || node.childNodes;
              if (children) for (const c of children) walk(c);
            };
            walk(document);
            return inputs[0] || null;
          });
          const el = handle.asElement();
          if (el) {
            await el.setInputFiles(video_path);
            return true;
          }
        } catch {}
      }
      return false;
    };

    let uploaded = await tryUpload();

    if (!uploaded) {
      // 尝试点击指向 upload 的链接
      try {
        const linkInfo = await page.$$eval('a', as =>
          as.map(a => ({ text: (a.innerText || '').trim(), href: a.href }))
        );
        const target = linkInfo.find(a => a.href.includes('/creator-micro/content/upload'));
        if (target) {
          await page.goto(target.href, { waitUntil: 'domcontentloaded' });
          await sleep(5000);
        }
      } catch {}
      uploaded = await tryUpload();
    }

    if (!uploaded) {
      try {
        await page.screenshot({ path: '/tmp/douyin-upload.png', fullPage: true });
        console.log('已保存调试截图 /tmp/douyin-upload.png');
      } catch {}
      throw new Error('未找到文件上传输入框');
    }
    console.log('已设置视频文件');

    // 等待上传完成
    console.log('等待上传完成...');
    let uploadComplete = false;

    for (let i = 0; i < 120; i++) {
      await sleep(2000);

      // 检查是否出现标题输入框（上传完成的标志）
      const titleInput = await page.$('input[placeholder*="标题"], input[placeholder*="填写标题"]');
      if (titleInput) {
        console.log('检测到表单，上传完成');
        uploadComplete = true;
        break;
      }

      // 检查进度条
      const progressEl = await page.$('[class*="progress"], [class*="upload-progress"]');
      if (progressEl) {
        const text = await progressEl.textContent().catch(() => '');
        if (text.includes('100') || text.includes('完成')) {
          console.log('上传完成');
          uploadComplete = true;
          break;
        }
      }
    }

    if (!uploadComplete) {
      console.log('警告：未检测到上传完成标志，继续下一步...');
    }

    await sleep(3000);

    // 填写标题
    console.log('填写标题...');
    const titleInput = page.locator('input[placeholder*="标题"], input[placeholder*="填写标题"]').first();
    const titleCount = await titleInput.count();
    if (titleCount > 0) {
      await titleInput.fill(title.substring(0, 60));
      console.log('已填写标题');
    }

    // 填写简介
    console.log('填写简介...');
    const descInput = page.locator('textarea[placeholder*="简介"], textarea[placeholder*="描述"]').first();
    const descCount = await descInput.count();
    if (descCount > 0 && content) {
      await descInput.fill(content.substring(0, 500));
      console.log('已填写简介');
    }

    // 添加标签
    if (tags.length > 0) {
      console.log('添加标签...');
      const tagInput = page.locator('input[placeholder*="标签"], input[placeholder*="添加话题"]').first();
      const tagCount = await tagInput.count();
      if (tagCount > 0) {
        for (const tag of tags.slice(0, 5)) {
          await tagInput.fill(tag);
          await tagInput.press('Enter');
          await sleep(500);
        }
      }
    }

    // 可选：发布前暂停，等待人工确认/操作
    if (process.env.PAUSE_BEFORE_PUBLISH === '1') {
      try {
        await page.screenshot({ path: '/tmp/douyin-before-publish.png', fullPage: true });
        console.log('已保存发布前截图 /tmp/douyin-before-publish.png');
      } catch {}
      console.log('已暂停在发布前，按 Enter 继续执行发布...');
      await new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.once('data', () => resolve());
      });
    }

    // 设置可见性
    if (visibility === 'private') {
      console.log('设置私密...');
      const privateBtn = page.locator(':has-text("私密"), [data-action="private"]').first();
      const privateCount = await privateBtn.count();
      if (privateCount > 0) {
        await privateBtn.click();
      }
    }

    // 滚动到底部
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(2000);

    // 提交发布
    console.log('提交发布...');
    const submitSelectors = [
      'button:has-text("发布")',
      'button:has-text("立即发布")',
      'button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw',
      '[class*="publish-btn"]',
      '[data-action="publish"]',
    ];

    let clicked = false;
    for (const selector of submitSelectors) {
      try {
        const locator = page.locator(selector).first();
        const count = await locator.count();
        if (count > 0) {
          const isVisible = await locator.first().isVisible();
          const isEnabled = await locator.first().isEnabled();
          if (isVisible && isEnabled) {
            await locator.first().click();
            clicked = true;
            console.log(`点击了提交按钮：${selector}`);
            break;
          }
        }
      } catch (e) {
        // 继续
      }
    }

    if (!clicked) {
      // 使用 eval 点击
      const result = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const publishBtn = buttons.find(b => b.textContent?.includes('发布'));
        if (publishBtn) {
          publishBtn.click();
          return true;
        }
        return false;
      });

      if (result) {
        clicked = true;
      }
    }

    if (!clicked) {
      throw new Error('未找到发布按钮');
    }

    // 等待发布完成
    console.log('等待发布完成...');
    await sleep(10000);

    // 发布后检查：作品管理/草稿箱/审核中
    try {
      console.log('检查发布结果页面...');
      await page.goto('https://creator.douyin.com/creator-micro/content/manage', { waitUntil: 'domcontentloaded' });
      await sleep(5000);
      await page.screenshot({ path: '/tmp/douyin-manage.png', fullPage: true });

      // 尝试点击“草稿箱”
      try {
        const draftTab = page.getByText(/草稿|草稿箱/).first();
        if (await draftTab.count()) {
          await draftTab.click();
          await sleep(3000);
          await page.screenshot({ path: '/tmp/douyin-drafts.png', fullPage: true });
        }
      } catch {}

      // 尝试点击“审核中/处理中”
      try {
        const pendingTab = page.getByText(/审核中|处理中/).first();
        if (await pendingTab.count()) {
          await pendingTab.click();
          await sleep(3000);
          await page.screenshot({ path: '/tmp/douyin-pending.png', fullPage: true });
        }
      } catch {}
    } catch {}

    // 保存 cookies
    await saveCookies();
    await page.close();

    res.json({
      success: true,
      data: {
        title,
        video_path,
        status: 'published',
      },
      message: '视频发布成功',
    });
  } catch (error) {
    console.error('发布失败:', error);
    res.status(500).json({
      error: '发布失败',
      code: 'PUBLISH_FAILED',
      details: error.message,
    });
  }
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭浏览器...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Douyin MCP Server (Playwright) running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
