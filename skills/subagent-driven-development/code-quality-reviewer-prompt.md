# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

```
Task tool (general-purpose):
  Use template at requesting-code-review/code-reviewer.md

  DESCRIPTION: [task summary, from implementer's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]

  ## Vue Tech Stack Skills

  When reviewing Vue code, you MUST load the relevant skills from
  ~/.claude/skills/ to understand what correct Vue code looks like. Use the
  Skill tool to invoke them:

  - **Vue components or SFCs:** invoke `vue` and `vue-best-practices`
  - **Vue Router code:** invoke `vue-router-best-practices`
  - **Pinia stores:** invoke `pinia`
  - **Vue composables:** invoke `vueuse-functions`
  - **Tests (Vitest):** invoke `vitest` and `vue-testing-best-practices`
  - **Vite config:** invoke `vite`

  Invoke the relevant skill(s) BEFORE reviewing. They contain up-to-date
  patterns and best practices you must verify the implementation against.
```

**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation create new files that are already large, or significantly grow existing files? (Don't flag pre-existing file sizes — focus on what this change contributed.)

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment
