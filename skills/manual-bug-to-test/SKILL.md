---
name: manual-bug-to-test
description: Use when the human partner reports a manually discovered bug and wants to convert it into an automated failing reproduction before debugging
---

## 总结

将人类手动发现的 bug 转化为 Playwright 浏览器复现脚本。在真实浏览器中跑通 bug 复现流程，捕获失败证据（截图 + DOM 快照 + 控制台错误），确认 RED 后交接给 systematic-debugging。

# 手动 Bug 转自动化复现

## 概述

将手动 bug 转化为 Playwright 驱动的浏览器复现脚本。唯一的测试环境是真实浏览器。

**核心原则：** 没有自动化复现证据，不进入调试。截图和 DOM 快照是 Claude 能读的证据。

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

- 项目已有 Playwright 依赖
- 项目能通过 `npm run dev`（或等效命令）启动 dev server
- 如果没有 Playwright：`npm install -D playwright @playwright/test && npx playwright install chromium`

## 过程

### 第一步：收集复现信息

以下四项全部确认后再进入第二步：

- [ ] **复现步骤**：精确操作序列。`点击"提交"按钮` 不够，必须是 `页面 /checkout 路由下，填写表单，点击 id="submit-btn" 的按钮`
- [ ] **实际行为**：发生了什么（页面状态、错误弹窗、白屏、控制台报错文本）
- [ ] **预期行为**：应该发生什么
- [ ] **环境信息**：浏览器类型、页面路由、触发所需的数据状态

缺任何一项 → 追问，不猜测。

### 第二步：写 Playwright 复现脚本

脚本写入 `scripts/bug-<简短描述>.ts`。使用本目录下的 `smoke-template.ts` 作为模板。

**脚本必须：**
- 启动浏览器，导航到 bug 触发的页面路由
- 按第一步收集的步骤精确操作
- 每一步之后截图（`page.screenshot()`）
- 捕获控制台错误（`page.on('console')`）
- 断言预期行为
- 输出结构化 JSON：`{ passed, step, error: { message, screenshot, domSnapshot, url, consoleErrors } }`

### 第三步：启动 dev server 并运行脚本

```bash
# 终端1：启动 dev server
npm run dev &

# 终端2：运行复现脚本
npx tsx scripts/bug-<简短描述>.ts
```

结果判断：

```
FAIL，错误信息与 bug 描述一致？
  → ✅ RED 确认。将脚本输出的 JSON 传递给 systematic-debugging

FAIL，错误信息与 bug 描述不一致？
  → 脚本有问题。检查操作步骤和断言，修正后重新运行

PASS（脚本通过）？
  → 脚本没抓到 bug。检查是否在正确路由、是否正确模拟了触发条件
```

### 第四步：交接

RED 确认后，调用 systematic-debugging，传递：

```
- 复现脚本：scripts/bug-<描述>.ts
- 运行命令：npx tsx scripts/bug-<描述>.ts
- 失败证据：<脚本输出的 JSON，含截图、DOM 快照、控制台错误>
```

**只有 Phase 1 可以跳过。** Phase 2（模式分析）和 Phase 3（假设验证）必须完整执行，并产出可见证据：

- Phase 2 必须输出：工作代码 vs 问题代码的差异清单
- Phase 3 必须输出：明确写下的假设 + 最小验证实验结果

复现脚本跑出失败 ≠ 找到了根因。看到错误栈就提修复 = 跳过了 Phase 2 和 Phase 3，这是违规。

## 修复后验证

TDD GREEN 修复完成后，重新跑复现脚本确认 PASS：

```bash
npx tsx scripts/bug-<描述>.ts   # 应输出 { passed: true }
```

## 红旗

| 想法 | 现实 |
|------|------|
| "这个 bug 很明显，直接修" | 没有复现证据就没有证明。 |
| "手动复现够了" | 手动靠记忆。脚本是永久证据。 |
| "我先修，测试后补" | 没有失败复现就没有修复目标。 |
| "写脚本太慢" | 手动复现 N 次 = 一个脚本的值。脚本跑一辈子。 |
| "截图看不出来" | 加上 DOM 快照和控制台日志。Claude 能读这些。 |
