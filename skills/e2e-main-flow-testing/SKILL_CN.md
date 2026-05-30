---
name: e2e-main-flow-testing
description: 在 Vue 项目主流程开发完成后使用 — 通过 Playwright 对项目的主要用户流程进行端到端测试，失败时结合 systematic-debugging 迭代修复，直到所有测试通过
---

# 端到端主流程测试

## 概述

在实现完成且所有单元/组件测试通过后，通过 Playwright 对 dev server 运行端到端验证。这是一项长时间运行的任务 — 不要赶工或在 token 用量上偷工减料。每个失败都要做完整的根因调查。

**核心原则：** 项目直到其主用户流程在真实浏览器中跑通，才算完成。

**开始时声明：** "我正在使用 e2e-main-flow-testing 技能来验证项目的主要用户流程。"

## 何时使用

在 `superpowers:finishing-a-development-branch` 成功完成后。向用户提议：

> "实现已完成，所有测试通过。是否需要我用 Playwright 对项目的主要用户流程运行端到端测试？这会在真实浏览器中验证完整应用，捕获单元测试无法发现的问题。"

等待用户回复。如果用户拒绝，到此为止。

## 前提

确认 Playwright 已安装。如未安装：

```bash
npm install -D @playwright/test playwright
npx playwright install chromium
```

创建或更新 `playwright.config.ts`：

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/output/report.json' }]],
  use: {
    baseURL: 'http://localhost:5173', // 根据项目的 dev server 调整
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
```

配置说明：
- `trace: 'retain-on-failure'` — Playwright trace 供人类调试，agent 不直接消费
- `screenshot: 'only-on-failure'` — Playwright 自身截图（供人类查看）
- 不开启 video — 不需要
- `fullyParallel: false` — 主流程测试串行执行，避免互相干扰

## 过程

### 第一步：识别主流程

阅读设计文档（`docs/superpowers/specs/`）和实现计划，提取项目的主要用户流程。主流程是用户完成核心任务的端到端路径。

**示例：**
- 浏览文档 → 选择一篇 → 查看内容
- 填写表单 → 提交 → 看到确认
- 登录 → 导航仪表盘 → 交互数据
- 搜索 → 筛选结果 → 查看详情页

将识别出的流程呈现给用户确认：

> "以下是我从设计中识别出的主要用户流程：
> 1. [流程 1 描述]
> 2. [流程 2 描述]
>
> 这些是否覆盖了关键路径？有需要增减的吗？"

迭代直到用户确认列表。

### 第二步：配置证据收集并编写测试

将本技能目录下的 `evidence-fixture.ts` 复制到项目的 `e2e/evidence-fixture.ts`。该 fixture 自动处理所有证据收集 — 你不需要编写任何收集代码。

测试文件写入 `e2e/<流程名>.spec.ts`。每个测试导入 fixture：

```typescript
import { evidenceTest as test, expect } from './evidence-fixture'

test.describe('主流程: <流程名称>', () => {
  test('应完成完整流程', async ({ page, evidence }) => {
    evidence.custom = { flow: '<流程名称>', step: 'navigate' }
    await page.goto('/route')

    evidence.custom.step = 'submit-form'
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByTestId('result')).toBeVisible()

    evidence.custom.step = 'verify-result'
    await expect(page.getByTestId('result')).toContainText('Success')
  })
})
```

**Fixture 自动收集的内容（无需编码）：**
- 所有控制台消息（log、warn、error）及位置信息
- `page.on('pageerror')` — 未捕获的页面异常及调用栈
- `page.on('requestfailed')` — 失败的网络请求
- `page.on('response', status >= 400)` — HTTP 4xx/5xx 响应
- 浏览器端 `window.onerror` 和 `unhandledrejection`（通过注入脚本捕获调用栈）
- 自定义上下文通过 `evidence.custom` — 标注当前业务步骤

**失败时（包括 timedOut 和 interrupted），fixture 导出到 `e2e/output/`：**
- `evidence.json` — 结构化汇总：错误 + 调用栈、URL、所有收集的事件、自定义上下文
- `page.html` — 当前页面 HTML（`page.content()`）
- `page.txt` — 可见文本内容（`body.innerText`）— 最有助于理解用户看到了什么
- `failure.png` — 全页截图（供人类查看，agent 不消费）

**通过时不写任何文件。**

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

**等待：**
- 不要使用 `page.waitForTimeout()` 或 `setTimeout` — 任意等待会导致测试不稳定
- 定位器自带可操作性等待 — 点击/填写不需要显式等待
- 使用 `waitForResponse`、`waitForURL` 或 web-first 断言来等待特定条件

**测试结构：**
- 一个测试对应一个用户流程 — 自包含，无相互依赖
- 使用 `evidence.custom.step` 标注当前业务步骤 — 失败时会出现在证据中
- 每个测试从头开始导航 — 不依赖前一个测试的状态

### 第三步：验证构建和 Dev Server

在运行 E2E 测试之前，先确认项目能成功构建且 dev server 能正常启动。跳过这一步会浪费大量时间在排查因构建失败导致的测试失败上。

```bash
# 1. 构建项目
npm run build

# 2. 启动 dev server 并验证响应
npm run dev &
DEV_PID=$!
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200" && echo "Dev server OK" || echo "Dev server FAILED"

# 3. 验证通过后关闭测试服务器（E2E 使用 Playwright 的 webServer 配置）
kill $DEV_PID 2>/dev/null
```

如果构建失败或 dev server 无响应，先修复问题再进入第四步。不要对未构建成功的代码运行 E2E 测试。

### 第四步：清理输出并运行测试

```bash
# 清理上次证据（每次运行前必须执行）
rm -rf e2e/output/

# 启动 dev server（如果未使用 Playwright webServer 配置）
npm run dev &

# 运行 E2E 测试 — 首个失败即停止
npx playwright test e2e/ --reporter=list --max-failures=1
```

`--max-failures=1` 确保测试运行器在第一个失败测试后立即停止。配合 `fullyParallel: false` 在 playwright.config.ts 中使用，测试串行执行，一个失败即终止。

### 第五步：处理失败

测试失败时，运行器立即停止（由 `--max-failures=1` 保证）。处理这个单一失败：

为每个失败的测试维护重试计数器。如果**同一个测试**在 3 次独立修复尝试后仍然失败，**立即停止并上交给人类** — 不要尝试第 4 次修复。

**每次失败的处理循环：**

1. 读取 `evidence.json` 获取完整信息：
   ```bash
   cat e2e/output/<test-name>-evidence.json
   ```
   包含：错误信息 + 调用栈、URL、所有控制台消息、页面错误、运行时错误、请求失败、HTTP 错误、自定义步骤上下文。

2. 读取 `page.txt` 获取失败时的可见文本 — 通常比原始 HTML 更有助于理解用户看到了什么。

3. 仅在需要检查特定 DOM 结构时读取 `page.html`。

4. 直接调用 `superpowers:systematic-debugging`，传入证据。evidence JSON 已包含失败复现 — 无需单独走 `manual-bug-to-test` 流程。

5. 修复后从头重新运行所有测试：
   ```bash
   rm -rf e2e/output/ && npx playwright test e2e/ --reporter=list --max-failures=1
   ```

6. 如果同一测试再次失败，递增其重试计数器，从第 1 步重复。

7. 所有测试通过后（无 `[EVIDENCE]` 行，退出码 0），进入第六步。

**三振出局规则：** 如果一个测试经过 3 次修复尝试后仍然失败：

- Fixture **通过代码强制执行** — 3 次失败后，测试抛出 `ESCALATED` 错误并拒绝运行。agent 无法绕过。
- 重试计数器存储在 `e2e/.retry-tracker.json`（跨测试运行持久化，`rm -rf e2e/output/` 不会删除它）。
- **停止。** 不要再尝试修复。不要删除 tracker 文件。
- **保留** `e2e/output/` 和 Playwright trace — 不要清理。
- 向人类报告：
  > "E2E 测试 `<test-name>` 在 3 次修复尝试后仍然失败。我无法自动解决这个问题。
  >
  > 证据已保留在：
  > - `e2e/output/<test-name>-evidence.json` — 完整结构化证据
  > - `e2e/output/<test-name>-page.txt` — 失败时的可见文本
  > - `e2e/output/<test-name>-page.html` — 页面 HTML
  > - `e2e/output/<test-name>-failure.png` — 截图
  > - Playwright trace 在 `test-results/` 中
  >
  > 修复后重新运行：`rm e2e/.retry-tracker.json && npx playwright test e2e/ --reporter=list --max-failures=1`"

- 人类修复问题后，删除 tracker 从第四步恢复。

**页面健康警告：** stderr 中的 `[HEALTH]` 行表示页面级问题（控制台错误、请求失败、运行时错误）。即使测试通过也要调查 — 它们可能是隐藏问题。

### 第六步：报告结果

当所有主流程测试通过时：

> "端到端主流程测试完成。所有 <N> 个流程在真实浏览器中通过。
>
> - 测试目录：`e2e/`
> - <N> 个流程已验证，测试过程中发现并修复了 <M> 个问题"

### 第七步：清理并提交

```bash
# 清理证据目录（必须执行）
rm -rf e2e/output/

# 清理重试计数器（如果存在）
rm -f e2e/.retry-tracker.json

# 确保临时产物被 gitignore
echo 'e2e/output/' >> .gitignore
echo 'e2e/.retry-tracker.json' >> .gitignore

# 提交测试文件、fixture 和配置
git add e2e/ playwright.config.ts .gitignore
git commit -m "test(e2e): add main flow E2E tests with Playwright"
```

**清理是强制的** — 除非某个测试通过三振规则上交给了人类。此时 `e2e/output/`、`test-results/`（trace）和 `e2e/.retry-tracker.json` 保留，供人类调查。

## 红旗

| 想法 | 现实 |
|------|------|
| "单元测试通过了，E2E 多余" | 单元测试发现不了集成问题。真实浏览器能发现真实问题。 |
| "我直接快速修一下，不用 systematic-debugging" | 每个失败都值得做根因调查。证据已经收集好了 — 用它。 |
| "我一次修多个失败" | 一个一个来。每个修复验证后再处理下一个。 |
| "这些失败大概是同一个根因" | 不要假设。独立调查每一个。 |
| "花太长时间了，收尾吧" | 设计时就是长时间运行任务。主流程必须跑通。Token 预算已批准。 |
| "再试一次，第 4 次可能就修好了" | Fixture 在 3 次失败后阻止重新运行。代码强制执行，不是靠指导。 |
| "我看看截图找线索" | 截图是给人看的。用 `page.txt` 和 `evidence.json` 代替。 |
| "跳过清理步骤" | `e2e/output/` 是临时文件。留着会污染仓库。 |
| "用 CSS 选择器，更简单" | CSS 选择器在重构时会断裂。用 `getByRole`、`getByLabel` 或 `getByTestId`。 |
| "加个 waitForTimeout 解决不稳定测试" | 任意等待掩盖了时机问题。用 `waitForResponse` 或 web-first 断言。 |

## 集成

**依赖技能：**
- **superpowers:systematic-debugging** — 为每个失败做根因调查（证据已由 fixture 收集）

**前置条件：**
- **superpowers:finishing-a-development-branch** — 主工作流必须在 E2E 验证之前完成
