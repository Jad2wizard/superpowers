---
name: manual-bug-to-test
description: 当人类伙伴报告了一个手动发现的 bug，希望将其转化为自动化失败复现后再进行调试时使用
---

# 手动 Bug 转自动化复现

## 概述

**输入：** 手动 bug 报告。**输出：** RED 复现脚本 + 结构化证据 → 交接给 systematic-debugging。

此技能产出的是失败测试和证据。不负责修复 bug，不负责验证修复。

## 何时使用

人类伙伴手动调用。不自动触发。

**适用：**
- 浏览器中手动操作发现的 bug
- 完整用户流程中的异常
- 不稳定复现的问题（Playwright 可重试直到复现）

**不适用：**
- 已有复现测试的 bug（直接用 systematic-debugging）
- 纯环境/配置问题

## 前提

- 项目已安装 `@playwright/test` + `playwright`
- 项目能通过 `npm run dev`（或等效命令）启动 dev server
- 如果没有安装：`npm install -D @playwright/test playwright && npx playwright install chromium`

确保 `e2e/evidence-fixture.ts` 存在。如果项目之前运行过 `e2e-main-flow-testing`，该文件已存在。否则从 `e2e-main-flow-testing` 技能目录复制：

```bash
cp skills/e2e-main-flow-testing/evidence-fixture.ts e2e/evidence-fixture.ts
```

## 过程

### 第一步：收集复现信息

以下四项全部确认后再进入第二步：

- [ ] **复现步骤**：精确操作序列。`点击"提交"按钮` 不够，必须是 `页面 /checkout 路由下，填写表单，点击 id="submit-btn" 的按钮`
- [ ] **实际行为**：发生了什么（页面状态、错误弹窗、白屏、控制台报错文本）
- [ ] **预期行为**：应该发生什么
- [ ] **环境信息**：浏览器类型、页面路由、触发所需的数据状态

缺任何一项 → 追问，不猜测。

### 第二步：编写 Playwright 测试

测试写入 `e2e/bug-<简短描述>.spec.ts`。遵循 smoke-template 模板：导入 `evidence-fixture.ts`，用 `evidence.custom` 标注步骤，使用语义化定位器和 web-first 断言。

```typescript
import { evidenceTest as test, expect } from './evidence-fixture'

test('bug: <简短描述>', async ({ page, evidence }) => {
  evidence.custom = { bug: '<简短描述>', source: 'manual-report' }

  // 步骤1：导航到 bug 触发的页面路由
  evidence.custom.step = 'navigate'
  await page.goto('/the-route')

  // 步骤2：执行第一步收集的精确复现步骤
  evidence.custom.step = 'trigger-bug'
  await page.getByRole('button', { name: 'Submit' }).click()

  // 步骤3：断言预期行为（会失败 —— RED）
  evidence.custom.step = 'verify'
  await expect(page.getByTestId('result')).toContainText('Expected content')
})
```

**Fixture 自动收集的内容（无需编码）：**
- 所有控制台消息（log、warn、error）及位置信息
- console.error 调用及完整调用栈（通过注入的拦截脚本）
- `page.on('pageerror')` — 未捕获的页面异常及调用栈
- `page.on('requestfailed')` — 失败的网络请求
- `page.on('response', status >= 400)` — HTTP 4xx/5xx 响应
- 浏览器端 `window.onerror` 和 `unhandledrejection` 及调用栈
- 自定义上下文通过 `evidence.custom`

**失败时，证据导出到 `e2e/output/`：**
- `<test-name>-evidence.json` — 结构化汇总，包含所有收集的事件和自定义上下文
- `<test-name>-page.html` — 当前页面 HTML（`page.content()`）
- `<test-name>-page.txt` — 可见文本内容（`body.innerText`）— 最有助于理解 bug
- `<test-name>-failure.png` — 全页截图（供人类查看，agent 不消费）

#### 测试编写指南

**定位器 — 按以下优先级使用：**
1. `getByRole`（最健壮）— `page.getByRole('button', { name: 'Submit' })`
2. `getByLabel` / `getByPlaceholder` — `page.getByLabel('Email')`
3. `getByText` — `page.getByText('Welcome')`
4. `getByTestId`（语义定位器不可用时）— `page.getByTestId('submit-btn')`
5. CSS/XPath — 最后手段，尽量避免

**断言：**
- 始终使用 web-first 断言（自动重试）：`await expect(locator).toBeVisible()`
- 不要对 DOM 使用通用断言：`expect(await locator.isVisible()).toBe(true)` — 无自动重试，会导致测试不稳定
- 关键检查前做渐进式断言：验证容器可见 → 加载完成 → 内容正确
- 断言第一步中记录的具体预期行为

**等待：**
- 不要使用 `page.waitForTimeout()` 或 `setTimeout` — 任意等待会导致测试不稳定
- 定位器自带可操作性等待 — 点击/填写不需要显式等待
- 使用 `waitForResponse`、`waitForURL` 或 web-first 断言来等待特定条件

**测试结构：**
- 一个测试对应一个 bug — 自包含，只关注复现该问题
- 使用 `evidence.custom.step` 标注当前复现步骤 — 失败时会出现在证据中
- 每个测试从头开始导航 — 不依赖前一个测试的状态

### 第三步：运行测试

```bash
# 启动 dev server
npm run dev &

# 运行 bug 复现
npx playwright test e2e/bug-<简短描述>.spec.ts --reporter=list
```

结果判断：

- **FAIL 与 bug 描述一致** → RED 确认。进入第四步。
- **FAIL 与 bug 描述不一致** → 修正测试步骤或断言，重新运行。
- **PASS** → 测试没抓到 bug。重新检查路由、触发条件，或要求更精确的步骤。

### 第四步：交接给 systematic-debugging

调用 `superpowers:systematic-debugging`，传递：

```
- 测试文件：e2e/bug-<描述>.spec.ts
- 运行命令：npx playwright test e2e/bug-<描述>.spec.ts --reporter=list
- 失败证据：e2e/output/<test-name>-evidence.json
```

交接前读取证据：
```bash
cat e2e/output/<test-name>-evidence.json      # 结构化汇总
cat e2e/output/<test-name>-page.txt            # 失败时的可见文本 — 最有用
```

## 红旗

| 想法 | 现实 |
|------|------|
| "我先修，测试后补" | 没有失败复现就没有修复目标。 |
| "没 RED 也没关系，我理解这个 bug" | 没有 RED 就没有证据。没有证据就不进入调试。 |
| "用 CSS 选择器，更快" | CSS 选择器在重构时会断裂。用 `getByRole`、`getByLabel` 或 `getByTestId`。 |
| "加个 waitForTimeout 让 bug 复现" | `waitForTimeout` 掩盖了时机问题，让复现不稳定。用 web-first 断言。 |
