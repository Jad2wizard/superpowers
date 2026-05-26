/**
 * Bug 复现脚本模板
 *
 * 用法: npx tsx scripts/bug-<描述>.ts
 * 需要先启动 dev server: npm run dev
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

interface BugError {
  step: string;
  message: string;
  screenshot: string;
  domSnapshot: string;
  url: string;
  consoleErrors: string[];
  uncaughtErrors: string[];
}

interface Result {
  passed: boolean;
  bug?: string;
  error?: BugError;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // console.error() 调用
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // 未捕获的 JS 异常（undefined.foo、x is not a function 等）——白屏的常见原因
  const uncaughtErrors: string[] = [];
  page.on('pageerror', (err) => {
    uncaughtErrors.push(err.message);
  });

  const result: Result = { passed: false };

  try {
    // === 第一步：导航到目标页面 ===
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    // === 第二步：执行复现步骤 ===
    // TODO: 替换为实际复现步骤
    // await page.click('button:has-text("提交")');
    // await page.fill('input[name="email"]', 'test@example.com');

    // === 第三步：断言预期行为 ===
    // TODO: 替换为实际断言
    // await page.waitForSelector('.success-message', { timeout: 5000 });
    // const text = await page.textContent('.result');
    // if (text !== '预期内容') {
    //   throw new Error(`预期 '预期内容'，实际 '${text}'`);
    // }

    result.passed = true;
  } catch (e) {
    const error = e as Error;
    result.error = {
      step: 'TODO: 当前步骤描述',
      message: error.message,
      screenshot: (await page.screenshot({ type: 'png' })).toString('base64'),
      domSnapshot: await page.evaluate(() => document.body.innerHTML),
      url: page.url(),
      consoleErrors,
      uncaughtErrors,
    };
    result.bug = 'TODO: bug 简短描述';
  }

  // === 输出结构化 JSON ===
  console.log(JSON.stringify(result, null, 2));
  await browser.close();

  // 有失败时非零退出
  if (!result.passed) {
    process.exit(1);
  }
}

main();
