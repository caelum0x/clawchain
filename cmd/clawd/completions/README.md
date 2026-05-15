# clawd Shell Completions

Shell completion scripts for the `clawd` CLI. These provide tab-completion for
commands, subcommands, and flags in bash, zsh, and fish.

## Quick Setup

### Bash

Load completions for the current session:

```bash
source <(clawd completion bash)
```

Make persistent (choose one):

```bash
# Option A: bash-completion directory (Linux)
clawd completion bash > /etc/bash_completion.d/clawd

# Option B: Homebrew bash-completion (macOS)
clawd completion bash > /usr/local/etc/bash_completion.d/clawd

# Option C: Source from your profile
echo 'source <(clawd completion bash)' >> ~/.bashrc
```

### Zsh

Add to your fpath and reload completions:

```zsh
mkdir -p ~/.zsh/completions
clawd completion zsh > ~/.zsh/completions/_clawd
```

Then add to your `~/.zshrc` (before `compinit`):

```zsh
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit && compinit
```

Reload: `exec zsh` or open a new terminal.

### Fish

Save to your fish completions directory:

```fish
clawd completion fish > ~/.config/fish/completions/clawd.fish
```

Fish picks up new completions automatically in new shells.

## What Gets Completed

- All top-level commands (status, up, agent, gpu, privacy, etc.)
- All subcommands under each command group
- All flags and options with descriptions
- Flag value suggestions where applicable (e.g., output formats, vote options)
