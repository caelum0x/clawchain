# Branch Protection Runbook

This repository should protect `main` with required status checks so PRD and build regressions cannot merge.

## Required Checks

Set these checks as **required** for the `main` branch:

- `PRD Verify / prd-verify`
- `Lint / golangci`
- `Unit tests / tests`

Policy verification command for this document and workflow/job coherence:

```bash
make branch-protection-verify
```

These names map to workflow/job names in:

- `.github/workflows/prd-verify.yml`
- `.github/workflows/lint.yml`
- `.github/workflows/go-unit.yml`

## Recommended Protection Settings

- Require a pull request before merging.
- Require approvals: `1` minimum.
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merge.
- Require status checks to pass before merge.
- Require branches to be up to date before merge.
- Restrict force pushes.
- Restrict branch deletion.

## Configure via GitHub UI

1. Open repository Settings.
2. Go to Branches.
3. Add/Edit a branch protection rule for `main`.
4. Enable the recommended settings above.
5. Add the three required status checks listed above.

## Configure via CLI (`gh api`)

Use this from the repo root (requires `gh auth login`):

```bash
OWNER="$(gh repo view --json owner --jq .owner.login)"
REPO="$(gh repo view --json name --jq .name)"

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER}/${REPO}/branches/main/protection" \
  -f required_status_checks.strict=true \
  -f required_status_checks.contexts[]="PRD Verify / prd-verify" \
  -f required_status_checks.contexts[]="Lint / golangci" \
  -f required_status_checks.contexts[]="Unit tests / tests" \
  -F enforce_admins=true \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F required_pull_request_reviews.require_code_owner_reviews=false \
  -F required_conversation_resolution=true \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F block_creations=false
```

Verify:

```bash
gh api "/repos/${OWNER}/${REPO}/branches/main/protection"
```
