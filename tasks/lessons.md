# Lessons

## 2026-05-17

- When a user gives a mixed fork list with exact repo names and category labels, resolve ambiguous concrete entries with GitHub first, document the chosen owner/name mapping, and do not invent repositories for category-only warnings.
- For external fork workflows, clone forks into a dedicated third-party directory and add `upstream` remotes immediately so later sync work is explicit and low-friction.
- When flattening submodules into normal directories, do not describe `git rm --cached` as complete by itself. Stage the real directory contents and commit the replacement, otherwise VS Code/Git will keep showing the old gitlink paths as deleted.

## 2026-03-08

- When the user references ClawChain integration scope, do not collapse the request to `extensions/clawchain/` without verifying whether they mean the full `openclaw/` platform.
- Before proposing implementation files, inspect the top-level `openclaw/` architecture (`src/gateway/`, `src/agents/`, `src/channels/`, `apps/`, `skills/`, `ui/`) and restate scope in repo terms.
- For scope-sensitive work, record the confirmed target in `tasks/todo.md` before implementation to avoid drifting into a narrower subsystem.
