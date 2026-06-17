# Superpowers-Vue 改造点汇总

基于上游 [Superpowers](https://github.com/obra/superpowers) main 分支，`vue` 分支共 **19 个 commits**，涉及 **385 个文件变更（+43,195/-110 行）**。

---

## 一、Vue 技术栈技能体系（`vue-skills/`，新增约 350 个文件）

新增 9 个面向 Vue 生态的专业技能，每个技能包含 SKILL.md 及完整的 references 参考文档：

| 技能 | 内容 |
|------|------|
| **vue** | Vue 3 Composition API、`<script setup>` 宏、响应式系统、内置组件（Teleport/Suspense/KeepAlive/Transition） |
| **vue-best-practices** | SFC 最佳实践、性能优化（虚拟列表/v-once/v-memo）、动画、插槽、异步组件、Composables、指令、渲染函数等 20+ 参考文档 |
| **vue-router-best-practices** | 导航守卫陷阱（beforeEnter 无参数触发、beforeRouteEnter 无 this、next 已废弃）、参数变更不触发生命周期、无限循环防护、生产环境用法等 8 篇参考 |
| **pinia** | Store 定义、组合式 Store、SSR/HMR/Nuxt 高级用法、测试最佳实践、插件系统 |
| **vitest** | CLI、配置、describe/it/test API、expect 断言、Mock (vi)、覆盖率、并发、快照、环境配置、类型测试等完整参考 |
| **vue-testing-best-practices** | 组件黑盒测试方法、异步组件测试、Pinia Store 测试设置、Composables 测试、Playwright E2E 推荐、快照陷阱等 |
| **vite** | 核心配置、插件 API、构建与 SSR、Environment API、Rolldown 迁移指南 |
| **vueuse-functions** | VueUse 200+ composable 函数参考文档（useFetch/useStorage/useDraggable/useVirtualList 等） |

---

## 二、brainstorming 流程重构（核心变更）

步骤从 9 步扩展为 **11 步**，强制使用 `TaskCreate` 逐项追踪：

| 步骤 | 内容 | 变更类型 |
|------|------|---------|
| 1 | Explore project context | 不变 |
| 2 | Offer visual companion | 不变 |
| 3 | Ask clarifying questions | **净化**：移除 grill-me 风格追问指令（决策树追踪、边缘压测、术语精确化、穷尽追问），仅保留"带推荐答案 + 多选优先 + 一次一问" |
| 4 | Propose 2-3 approaches | 强制浏览器端展示方案对比 |
| 5 | Present design | 强制浏览器端逐段展示设计，每段确认，最终显式询问整体通过 |
| 6 | Generate UI Mockups | **新增**：视觉项目调用 ui-ux-pro-max 生成 HTML 设计 token 和屏幕 mockup |
| 7 | Grill the Design | **新增**：设计确认后、写文档前，显式执行交互式压力测试。五个维度 — 决策树追踪、模糊术语精确化、边缘案例压测、决策间依赖检查、缺失模块探测。每个话题不穷尽不换下一个（3-5 个追问），HARD-GATE 收尾 |
| 8 | Write design doc | 文档必须包含 UI Design 章节（引用 mockup 文件路径） |
| 9 | Spec self-review | 增加 mockup 引用检查项 |
| 10 | User reviews written spec | 不变 |
| 11 | Transition to implementation | 不变 |

### 关键设计决策：grill-me 思想的吸收方式

grill-me 的 relentlessly interview 哲学不再散落在 Step 3（澄清问题）中。而是：

- **Step 3** 回归纯粹的"理解需求"——简短、聚焦、不过度追问
- **Step 7** 独立承担"挑战方案"的角色——在设计确认后、文档固化前，对完整设计进行系统化的交互式压力测试

这样区分了两个不同性质的对话阶段：发现（理解用户想要什么）与验证（确认方案是否真的可行）。

### 其他 brainstorming 变更

- 浏览器优先原则：visual companion 运行时，Steps 4-6 的内容必须推到浏览器端，终端仅用于简要过渡消息
- 新增 Hard-gate：用户确认整体设计后才能进入 Step 6；用户确认 mockup 后才能进入 Step 7；用户确认 grilling 结果后才能进入 Step 8
- 设计文档新增 UI Design 章节模板，包含权威 mockup 文件引用

---

## 三、`session-start` hook 扩展

新增 `ui-ux-pro-max` 依赖检测逻辑：

- 启动时检查 `installed_plugins.json` 中是否有 ui-ux-pro-max 的注册记录（不仅是文件在磁盘上）
- 验证 scope 是否匹配当前项目（user scope 全局可用，local/project scope 需项目路径匹配）
- 三种状态注入不同提示：
  - **已可用**：`<DEPENDENCY>` 标签携带脚本路径
  - **未注册到此项目**：`<important-reminder>` 提示安装到当前项目
  - **完全未安装**：`<important-reminder>` 提示全局安装

---

## 四、安装脚本（新增 `install.sh` / `install.ps1`）

- 支持 macOS/Linux（bash）和 Windows（PowerShell）一键安装
- 自动注册 marketplace（`Jad2wizard/superpowers`）
- 自动安装插件、检测 Playwright、安装 Chromium
- 版本号：5.1.0 → 5.2.6

---

## 五、子代理驱动开发强化

**`subagent-driven-development/SKILL.md`**：
- 强制要求所有任务完成后必须调用 `finishing-a-development-branch`
- 执行顺序：implement → spec-review → code-quality-review → finishing-a-development-branch

**`implementer-prompt.md`**：
- 编写 Vue 代码前必须加载对应 Vue 技能
- 测试模式区分：SFC → browser mode，composables/stores/utils → node mode

**`spec-reviewer-prompt.md` / `code-quality-reviewer-prompt.md`**：
- 审查时加载 Vue 技能作为正确性判断依据

---

## 六、`writing-plans` 技能扩展

- 编写 Vue 相关计划任务前必须先 invoke 对应技能（vue/vue-best-practices/vue-router/pinia/vueuse/vitest/vue-testing/vite）
- 新增测试基础设施章节：
  - 测试运行器：Vitest
  - SFC 测试：Vitest browser mode（`@vitest/browser` + Playwright）
  - Composables/Stores/Utils 测试：Vitest node mode
  - 包含完整的安装和配置指令
- 计划任务中的代码必须可直接复制使用

---

## 七、新增 2 个技能

### e2e-main-flow-testing

实现完成后运行 Playwright E2E 验证主用户流程：

- 自动配置 `playwright.config.ts`
- 从设计文档提取用户流程，生成结构化测试
- 带 `evidence-fixture.ts` 证据采集
- 失败时自动触发 `systematic-debugging` 排查

### manual-bug-to-test

手动 Bug → 自动化复现脚本：

- 四步流程：收集复现信息 → 写 Playwright 测试 → 运行确认 RED → 交接给 systematic-debugging
- 附带 `smoke-template.ts` 模板
- 支持间歇性 Bug（可配置重试）

---

## 八、`finishing-a-development-branch` 扩展

步骤从 6 步扩展为 **7 步**：

- **新增 Step 6（E2E 测试选项）**：对 Vue 视觉项目，在分支完成操作后提供结构化选择：
  1. Run E2E tests against main user flows
  2. Done for now
- 选择 1 则 invoke `e2e-main-flow-testing`
- Options 1/2/3 必须经过此步骤，Option 4（Discard）跳过
- 后续步骤重新编号（Step 6 → Step 7 cleanup）

---

## 九、`using-superpowers` 技能补充

新增 **Required Dependencies** 章节：

- 声明 `ui-ux-pro-max` 为 superpowers-vue 的必需依赖
- 要求 agent 在首条回复中检查 `<DEPENDENCY>` / `<important-reminder>` 标签
- 缺失时提示安装命令

---

## 十、品牌与文档适配

- **`README.md`**：从 Superpowers 改写为 Superpowers-Vue，更新安装命令（marketplace 地址、插件名称）、补充 How it works 差异化说明
- **`AGENTS.md`**：从符号链接改为完整文件，写入 Superpowers 的 Contributor Guidelines（PR 模板要求、不接受的内容类型清单、94% 拒绝率警示）
- **`package.json`**：version → 5.2.6
- **`.claude-plugin/plugin.json`**、**`.codex-plugin/plugin.json`**、**`.cursor-plugin/plugin.json`**：插件元数据更新

---

## 总结

核心思路：**在 Superpowers 通用开发方法论之上，深度集成 Vue 生态（Vue 3 + Pinia + Vue Router + Vitest + Vite + VueUse + Playwright），引入 ui-ux-pro-max 实现 brainstorm 阶段的可视化设计输出，并将 grill-me 的 relentlessly interview 哲学从散布在澄清问题中收敛为独立的 Grilling 压力测试阶段。**

整体形成了一条"需求脑暴 → 可视化设计 → 方案 Grilling → TDD 实现 → E2E 验证"的完整 Vue 项目开发流水线。
