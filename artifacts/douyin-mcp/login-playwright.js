#!/usr/bin/env node

/**
 * 抖音登录工具 - Playwright 版本
 * 扫码登录抖音创作者平台
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_PATH = path.join(__dirname, 'cookies.json');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function login() {
  console.log('🚀 启动浏览器...');

  const browser = await chromium.launch({
    headless: false, // 显示浏览器窗口方便扫码
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    console.log('🌐 访问抖音创作者发布页面...');
    await page.goto('https://creator.douyin.com/creator-micro/content/upload', { waitUntil: 'domcontentloaded' });
    await sleep(5000);

    console.log('📱 请打开抖音 App 扫描二维码登录');
    console.log('⏱️  等待扫码中...');

    // 等待用户手动扫码确认（不自动刷新/跳转）
    console.log('✅ 请在页面完成扫码并确认登录。');
    console.log('完成后回到终端按 Enter 保存 cookies 并退出。');

    await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log(`📝 Cookies 已保存到：${COOKIE_PATH}`);

    console.log('\n✅ 登录完成！');
    console.log('提示：服务器启动时会自动加载保存的 cookies');

  } catch (error) {
    console.error('❌ 登录失败:', error);
  } finally {
    await browser.close();
  }
}

login();
