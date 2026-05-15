# AGENTS.md

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If something goes wrong, stop and re-plan immediately rather than continuing blindly.
- Use plan mode for verification steps, not only for building features.
- Write clear specifications upfront to reduce ambiguity.

### 2. Subagent Strategy
- Use subagents liberally to keep the main context window focused.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, increase parallel exploration via subagents.
- One task per subagent to maintain clear responsibility boundaries.

### 3. Self-Improvement Loop
- After any correction from the user, update `tasks/lessons.md`.
- Document the pattern that caused the mistake.
- Create rules to prevent the mistake from repeating.
- Review lessons at the start of future sessions when relevant.

### 4. Verification Before Completion
- Never mark a task complete without demonstrating it works.
- Compare behavior between `main` branch and new changes when applicable.
- Ask yourself: "Would a staff engineer approve this implementation?"
- Run tests, check logs, and verify correctness.

### 5. Demand Elegance (Balanced)
- For non-trivial changes ask: "Is there a more elegant solution?"
- If a fix feels hacky, step back and implement the cleaner approach.
- Skip this step for simple or obvious fixes to avoid over-engineering.
- Challenge your own implementation before presenting it.

### 6. Autonomous Bug Fixing
- When given a bug report: fix it directly.
- Investigate logs, errors, and failing tests before acting.
- Minimize context switching for the user.
- If CI tests fail, diagnose and resolve them proactively.

## Task Management

### 1. Plan First
- Write a plan in `tasks/todo.md` using checkable items.

### 2. Verify Plan
- Confirm the plan before beginning implementation.

### 3. Track Progress
- Mark tasks complete as work progresses.

### 4. Explain Changes
- Provide a high-level explanation at each step.

### 5. Document Results
- Add a review section to `tasks/todo.md`.

### 6. Capture Lessons
- Update `tasks/lessons.md` after corrections or discoveries.

## Core Principles

### Simplicity First
- Make every change as simple as possible while achieving the goal.
- Prefer minimal modifications over large rewrites.

### Root Cause Thinking
- Do not apply temporary fixes.
- Identify and resolve the underlying cause.

### Minimal Impact
- Touch only the code that is necessary.
- Avoid introducing unrelated changes or side effects.

## Engineering Standard
- Code should be readable and maintainable.
- Prefer clear logic over clever tricks.
- Validate behavior through tests whenever possible.
- Document assumptions and edge cases.

## Expected Behavior for the Agent
- Think before implementing.
- Prefer clarity over speed.
- Verify correctness before declaring success.
- Optimize only after correctness is confirmed.
