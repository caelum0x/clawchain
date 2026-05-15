# Fish completion script for clawd CLI
# Install: clawd completion fish > ~/.config/fish/completions/clawd.fish

# Disable file completions by default for clawd
complete -c clawd -f

# Helper: test if no subcommand has been given yet
function __clawd_no_subcommand
    set -l cmd (commandline -opc)
    for word in $cmd[2..-1]
        switch $word
            case '-*'
                continue
            case '*'
                return 1
        end
    end
    return 0
end

# Helper: test if current command context matches a parent command
function __clawd_using_command
    set -l expected $argv
    set -l cmd (commandline -opc)
    set -l depth (count $expected)
    set -l found 0
    set -l pos 0
    for word in $cmd[2..-1]
        switch $word
            case '-*'
                continue
            case '*'
                set pos (math $pos + 1)
                if test $pos -le $depth
                    if test "$word" != "$expected[$pos]"
                        return 1
                    end
                    set found (math $found + 1)
                else
                    return 1
                end
        end
    end
    test $found -eq $depth
end

# ---- Top-level commands ----
complete -c clawd -n __clawd_no_subcommand -a start -d 'Start chain node, OpenClaw gateway, and messaging server'
complete -c clawd -n __clawd_no_subcommand -a up -d 'Initialize, join network, then start runtime'
complete -c clawd -n __clawd_no_subcommand -a init -d 'Initialize a new ClawChain node/identity'
complete -c clawd -n __clawd_no_subcommand -a status -d 'Check chain node, peers, and gateway health'
complete -c clawd -n __clawd_no_subcommand -a dashboard -d 'Show comprehensive terminal dashboard'
complete -c clawd -n __clawd_no_subcommand -a join -d 'Join an existing clawd network'
complete -c clawd -n __clawd_no_subcommand -a doctor -d 'Run operator health diagnostics'
complete -c clawd -n __clawd_no_subcommand -a readiness -d 'Run strict integrated readiness checks'
complete -c clawd -n __clawd_no_subcommand -a release-summary -d 'Show release gate states'
complete -c clawd -n __clawd_no_subcommand -a install-node -d 'Install/manage local chain node service'
complete -c clawd -n __clawd_no_subcommand -a bootstrap -d 'One-command operator onboarding'
complete -c clawd -n __clawd_no_subcommand -a nodecard -d 'Print a shareable node descriptor'
complete -c clawd -n __clawd_no_subcommand -a keys -d 'Manage chain keys'
complete -c clawd -n __clawd_no_subcommand -a wallet -d 'Simple wallet UX'
complete -c clawd -n __clawd_no_subcommand -a autonomous -d 'Manage autonomous loop + skill executor'
complete -c clawd -n __clawd_no_subcommand -a peers -d 'Manage peer discovery settings'
complete -c clawd -n __clawd_no_subcommand -a incident -d 'Incident-mode controls'
complete -c clawd -n __clawd_no_subcommand -a faucet -d 'Token faucet for testnet onboarding'
complete -c clawd -n __clawd_no_subcommand -a send -d 'Send an encrypted message to another agent'
complete -c clawd -n __clawd_no_subcommand -a agent-flow -d 'Run core agent lifecycle'
complete -c clawd -n __clawd_no_subcommand -a product-flow -d 'Run end-to-end product flow'
complete -c clawd -n __clawd_no_subcommand -a agent -d 'Manage agent registration and status'
complete -c clawd -n __clawd_no_subcommand -a gpu -d 'GPU compute marketplace'
complete -c clawd -n __clawd_no_subcommand -a model -d 'AI model registry'
complete -c clawd -n __clawd_no_subcommand -a skill -d 'Marketplace skill listings'
complete -c clawd -n __clawd_no_subcommand -a escrow -d 'Manage marketplace escrows'
complete -c clawd -n __clawd_no_subcommand -a reputation -d 'Agent reputation and trust'
complete -c clawd -n __clawd_no_subcommand -a intent -d 'Multi-agent intent coordination'
complete -c clawd -n __clawd_no_subcommand -a task -d 'Manage agent task delegation'
complete -c clawd -n __clawd_no_subcommand -a governance -d 'On-chain governance proposals and voting'
complete -c clawd -n __clawd_no_subcommand -a messaging -d 'P2P encrypted messaging'
complete -c clawd -n __clawd_no_subcommand -a negotiate -d 'Agent-to-agent negotiation protocol'
complete -c clawd -n __clawd_no_subcommand -a privacy -d 'ZK privacy module'
complete -c clawd -n __clawd_no_subcommand -a staking -d 'Proof-of-stake delegation and rewards'
complete -c clawd -n __clawd_no_subcommand -a ibc -d 'IBC cross-chain queries'
complete -c clawd -n __clawd_no_subcommand -a query -d 'Standard chain queries'
complete -c clawd -n __clawd_no_subcommand -a completion -d 'Generate shell completion scripts'

# ---- Global flags ----
complete -c clawd -l help -s h -d 'Show help'
complete -c clawd -l version -s V -d 'Show version'

# ---- start ----
complete -c clawd -n '__clawd_using_command start' -l openclaw-bin -d 'Path to the openclaw binary'
complete -c clawd -n '__clawd_using_command start' -l node-binary -d 'Path to the clawchaind binary'
complete -c clawd -n '__clawd_using_command start' -l rpc-url -d 'Blockchain RPC URL'
complete -c clawd -n '__clawd_using_command start' -l rest-url -d 'Blockchain REST/LCD URL'
complete -c clawd -n '__clawd_using_command start' -l seeds -d 'Comma-separated seed peers'
complete -c clawd -n '__clawd_using_command start' -l persistent-peers -d 'Comma-separated persistent peers'
complete -c clawd -n '__clawd_using_command start' -l messaging-endpoint -d 'Public agent messaging endpoint'
complete -c clawd -n '__clawd_using_command start' -l no-auto-start -d 'Do not auto-start the chain node'
complete -c clawd -n '__clawd_using_command start' -l messaging-port -d 'Port for the agent messaging server'

# ---- up ----
complete -c clawd -n '__clawd_using_command up' -l openclaw-bin -d 'Path to the openclaw binary'
complete -c clawd -n '__clawd_using_command up' -l node-binary -d 'Path to the clawchaind binary'
complete -c clawd -n '__clawd_using_command up' -l messaging-port -d 'Port for the agent messaging server'
complete -c clawd -n '__clawd_using_command up' -l no-auto-start -d 'Do not auto-start the chain node'
complete -c clawd -n '__clawd_using_command up' -l skip-init -d 'Do not run init if mnemonic is missing'
complete -c clawd -n '__clawd_using_command up' -l skip-join -d 'Do not apply join/network configuration'
complete -c clawd -n '__clawd_using_command up' -l init-moniker -d 'Moniker to use when auto-running init'
complete -c clawd -n '__clawd_using_command up' -l chain-id -d 'Chain ID'
complete -c clawd -n '__clawd_using_command up' -l skip-setup -d 'Skip ZK trusted setup'
complete -c clawd -n '__clawd_using_command up' -l from-manifest -d 'Load config from manifest.json'
complete -c clawd -n '__clawd_using_command up' -l from-nodecard -d 'Load peer/endpoints from nodecard JSON'
complete -c clawd -n '__clawd_using_command up' -l rpc-url -d 'Blockchain RPC URL'
complete -c clawd -n '__clawd_using_command up' -l rest-url -d 'Blockchain REST/LCD URL'
complete -c clawd -n '__clawd_using_command up' -l seeds -d 'Comma-separated seed peers'
complete -c clawd -n '__clawd_using_command up' -l persistent-peers -d 'Comma-separated persistent peers'
complete -c clawd -n '__clawd_using_command up' -l faucet-url -d 'Faucet URL'
complete -c clawd -n '__clawd_using_command up' -l messaging-endpoint -d 'Public messaging endpoint URL'
complete -c clawd -n '__clawd_using_command up' -l host -d 'Public host/DNS'
complete -c clawd -n '__clawd_using_command up' -l no-sync-genesis -d 'Do not download/verify/write genesis'
complete -c clawd -n '__clawd_using_command up' -l require-signed-manifest -d 'Require trusted signature on manifest'
complete -c clawd -n '__clawd_using_command up' -l manifest-trusted-pubkeys -d 'Comma-separated trusted pubkeys'
complete -c clawd -n '__clawd_using_command up' -l request-faucet -d 'Request starter tokens after join'
complete -c clawd -n '__clawd_using_command up' -l require-ready -d 'Fail startup unless readiness passes'
complete -c clawd -n '__clawd_using_command up' -l skip-ready-gate -d 'Disable default readiness gating'
complete -c clawd -n '__clawd_using_command up' -l ready-timeout-seconds -d 'Readiness wait timeout in seconds'
complete -c clawd -n '__clawd_using_command up' -l json -d 'Output machine-readable startup report'

# ---- init ----
complete -c clawd -n '__clawd_using_command init' -l moniker -d 'Node moniker'
complete -c clawd -n '__clawd_using_command init' -l chain-id -d 'Chain ID'
complete -c clawd -n '__clawd_using_command init' -l node-binary -d 'Path to the clawchaind binary'
complete -c clawd -n '__clawd_using_command init' -l proof-binary -d 'Path to the clawproof binary'
complete -c clawd -n '__clawd_using_command init' -l skip-setup -d 'Skip ZK trusted setup'
complete -c clawd -n '__clawd_using_command init' -l force -d 'Force re-initialization'
complete -c clawd -n '__clawd_using_command init' -l seeds -d 'Comma-separated seed node addresses'
complete -c clawd -n '__clawd_using_command init' -l persistent-peers -d 'Comma-separated persistent peer addresses'
complete -c clawd -n '__clawd_using_command init' -l initial-tokens -d 'Initial token allocation'
complete -c clawd -n '__clawd_using_command init' -l validator-stake -d 'Validator stake amount'
complete -c clawd -n '__clawd_using_command init' -l from-manifest -d 'Apply join/bootstrap config from manifest'
complete -c clawd -n '__clawd_using_command init' -l from-nodecard -d 'Apply join/bootstrap config from nodecard'
complete -c clawd -n '__clawd_using_command init' -l rpc-url -d 'Override blockchain RPC URL'
complete -c clawd -n '__clawd_using_command init' -l rest-url -d 'Override blockchain REST/LCD URL'
complete -c clawd -n '__clawd_using_command init' -l faucet-url -d 'Faucet URL for bootstrap'
complete -c clawd -n '__clawd_using_command init' -l messaging-endpoint -d 'Public messaging endpoint URL'
complete -c clawd -n '__clawd_using_command init' -l host -d 'Public host/DNS'
complete -c clawd -n '__clawd_using_command init' -l no-sync-genesis -d 'Skip manifest genesis sync'
complete -c clawd -n '__clawd_using_command init' -l request-faucet -d 'Request starter tokens after bootstrap'

# ---- dashboard ----
complete -c clawd -n '__clawd_using_command dashboard' -l json -d 'Output machine-readable JSON'

# ---- join ----
complete -c clawd -n '__clawd_using_command join' -l from-manifest -d 'Load config from manifest.json'
complete -c clawd -n '__clawd_using_command join' -l from-nodecard -d 'Load peer/endpoints from nodecard JSON'
complete -c clawd -n '__clawd_using_command join' -l chain-id -d 'Chain ID'
complete -c clawd -n '__clawd_using_command join' -l rpc-url -d 'Blockchain RPC URL'
complete -c clawd -n '__clawd_using_command join' -l rest-url -d 'Blockchain REST/LCD URL'
complete -c clawd -n '__clawd_using_command join' -l seeds -d 'Comma-separated seed peers'
complete -c clawd -n '__clawd_using_command join' -l persistent-peers -d 'Comma-separated persistent peers'
complete -c clawd -n '__clawd_using_command join' -l faucet-url -d 'Faucet URL'
complete -c clawd -n '__clawd_using_command join' -l messaging-endpoint -d 'Public messaging endpoint URL'
complete -c clawd -n '__clawd_using_command join' -l host -d 'Public host/DNS'
complete -c clawd -n '__clawd_using_command join' -l no-sync-genesis -d 'Do not download/verify/write genesis'
complete -c clawd -n '__clawd_using_command join' -l require-signed-manifest -d 'Require trusted signature on manifest'
complete -c clawd -n '__clawd_using_command join' -l manifest-trusted-pubkeys -d 'Comma-separated trusted pubkeys'
complete -c clawd -n '__clawd_using_command join' -l request-faucet -d 'Request starter tokens after join'

# ---- doctor ----
complete -c clawd -n '__clawd_using_command doctor' -l json -d 'Output machine-readable diagnostics'

# ---- readiness ----
complete -c clawd -n '__clawd_using_command readiness' -l json -d 'Output machine-readable readiness result'

# ---- release-summary ----
complete -c clawd -n '__clawd_using_command release-summary' -l json -d 'Output machine-readable summary'
complete -c clawd -n '__clawd_using_command release-summary' -l failed-only -d 'Show only non-passing gates'

# ---- install-node ----
complete -c clawd -n '__clawd_using_command install-node' -l binary-path -d 'Path to clawchaind binary'
complete -c clawd -n '__clawd_using_command install-node' -l node-home -d 'clawchaind --home directory'
complete -c clawd -n '__clawd_using_command install-node' -l service-name -d 'Service name'
complete -c clawd -n '__clawd_using_command install-node' -l build-local -d 'Build clawchaind from local repo'
complete -c clawd -n '__clawd_using_command install-node' -l no-service -d 'Skip service install'
complete -c clawd -n '__clawd_using_command install-node' -l no-start-now -d 'Install but do not start immediately'

# ---- bootstrap ----
complete -c clawd -n '__clawd_using_command bootstrap' -l from-manifest -d 'Load config from manifest.json'
complete -c clawd -n '__clawd_using_command bootstrap' -l from-nodecard -d 'Load peer/endpoints from nodecard JSON'
complete -c clawd -n '__clawd_using_command bootstrap' -l chain-id -d 'Chain ID'
complete -c clawd -n '__clawd_using_command bootstrap' -l rpc-url -d 'Blockchain RPC URL'
complete -c clawd -n '__clawd_using_command bootstrap' -l rest-url -d 'Blockchain REST/LCD URL'
complete -c clawd -n '__clawd_using_command bootstrap' -l seeds -d 'Comma-separated seed peers'
complete -c clawd -n '__clawd_using_command bootstrap' -l persistent-peers -d 'Comma-separated persistent peers'
complete -c clawd -n '__clawd_using_command bootstrap' -l faucet-url -d 'Faucet URL'
complete -c clawd -n '__clawd_using_command bootstrap' -l messaging-endpoint -d 'Public messaging endpoint URL'
complete -c clawd -n '__clawd_using_command bootstrap' -l host -d 'Public host/DNS'
complete -c clawd -n '__clawd_using_command bootstrap' -l no-sync-genesis -d 'Do not download/verify/write genesis'
complete -c clawd -n '__clawd_using_command bootstrap' -l require-signed-manifest -d 'Require trusted signature on manifest'
complete -c clawd -n '__clawd_using_command bootstrap' -l manifest-trusted-pubkeys -d 'Comma-separated trusted pubkeys'
complete -c clawd -n '__clawd_using_command bootstrap' -l request-faucet -d 'Request starter tokens'
complete -c clawd -n '__clawd_using_command bootstrap' -l binary-path -d 'Path to clawchaind binary'
complete -c clawd -n '__clawd_using_command bootstrap' -l node-home -d 'clawchaind --home directory'
complete -c clawd -n '__clawd_using_command bootstrap' -l service-name -d 'Service name'
complete -c clawd -n '__clawd_using_command bootstrap' -l build-local -d 'Build clawchaind from local repo'
complete -c clawd -n '__clawd_using_command bootstrap' -l no-service -d 'Skip service install'
complete -c clawd -n '__clawd_using_command bootstrap' -l no-start-now -d 'Install but do not start immediately'
complete -c clawd -n '__clawd_using_command bootstrap' -l require-ready -d 'Wait for strict readiness'
complete -c clawd -n '__clawd_using_command bootstrap' -l ready-timeout-seconds -d 'Readiness wait timeout in seconds'

# ---- nodecard ----
complete -c clawd -n '__clawd_using_command nodecard' -l host -d 'Public host for peer endpoint'
complete -c clawd -n '__clawd_using_command nodecard' -l p2p-port -d 'Public p2p port'
complete -c clawd -n '__clawd_using_command nodecard' -l rpc-url -d 'Override RPC URL'
complete -c clawd -n '__clawd_using_command nodecard' -l rest-url -d 'Override REST URL'
complete -c clawd -n '__clawd_using_command nodecard' -l faucet-url -d 'Override faucet URL'
complete -c clawd -n '__clawd_using_command nodecard' -l messaging-endpoint -d 'Override messaging endpoint URL'
complete -c clawd -n '__clawd_using_command nodecard' -l write -d 'Write nodecard JSON to file'
complete -c clawd -n '__clawd_using_command nodecard' -l out -d 'Output format: json|pretty'

# ---- agent-flow ----
complete -c clawd -n '__clawd_using_command agent-flow' -l assignee -d 'Task assignee bech32 address'
complete -c clawd -n '__clawd_using_command agent-flow' -l description -d 'Task description'
complete -c clawd -n '__clawd_using_command agent-flow' -l requirements -d 'Task requirements'
complete -c clawd -n '__clawd_using_command agent-flow' -l skill-id -d 'Task skill ID'
complete -c clawd -n '__clawd_using_command agent-flow' -l budget -d 'Task budget'
complete -c clawd -n '__clawd_using_command agent-flow' -l deadline-blocks -d 'Task deadline block delta'
complete -c clawd -n '__clawd_using_command agent-flow' -l endpoint -d 'Heartbeat/registration endpoint override'
complete -c clawd -n '__clawd_using_command agent-flow' -l metadata -d 'Heartbeat metadata override'
complete -c clawd -n '__clawd_using_command agent-flow' -l name -d 'Registration name override'
complete -c clawd -n '__clawd_using_command agent-flow' -l json -d 'Output machine-readable lifecycle result'
complete -c clawd -n '__clawd_using_command agent-flow' -l auto-accept -d 'Auto-accept delegated task'
complete -c clawd -n '__clawd_using_command agent-flow' -l auto-complete -d 'Auto-complete delegated task'
complete -c clawd -n '__clawd_using_command agent-flow' -l completion-result -d 'Result payload for auto-complete'

# ---- product-flow ----
complete -c clawd -n '__clawd_using_command product-flow' -l assignee -d 'Task assignee bech32 address'
complete -c clawd -n '__clawd_using_command product-flow' -l task-description -d 'Task description'
complete -c clawd -n '__clawd_using_command product-flow' -l message-ciphertext -d 'Encrypted on-chain message payload'
complete -c clawd -n '__clawd_using_command product-flow' -l skill-id -d 'Marketplace skill ID'
complete -c clawd -n '__clawd_using_command product-flow' -l message-recipient -d 'Message recipient'
complete -c clawd -n '__clawd_using_command product-flow' -l message-nonce -d 'On-chain message nonce'
complete -c clawd -n '__clawd_using_command product-flow' -l escrow-description -d 'Escrow description'
complete -c clawd -n '__clawd_using_command product-flow' -l deadline-blocks -d 'Escrow deadline block delta'
complete -c clawd -n '__clawd_using_command product-flow' -l milestones -d 'Escrow milestone count'
complete -c clawd -n '__clawd_using_command product-flow' -l rating-score -d 'Rating score 1..5'
complete -c clawd -n '__clawd_using_command product-flow' -l rating-comment -d 'Rating comment override'
complete -c clawd -n '__clawd_using_command product-flow' -l endorsement-reason -d 'Endorsement reason override'
complete -c clawd -n '__clawd_using_command product-flow' -l endpoint -d 'Heartbeat/registration endpoint override'
complete -c clawd -n '__clawd_using_command product-flow' -l metadata -d 'Heartbeat metadata override'
complete -c clawd -n '__clawd_using_command product-flow' -l name -d 'Registration name override'
complete -c clawd -n '__clawd_using_command product-flow' -l json -d 'Output machine-readable lifecycle result'

# ---- wallet subcommands ----
complete -c clawd -n '__clawd_using_command wallet' -a balance -d 'Show wallet balances'
complete -c clawd -n '__clawd_using_command wallet' -a send -d 'Send CLAW tokens'
complete -c clawd -n '__clawd_using_command wallet' -a history -d 'Show recent wallet transaction history'
complete -c clawd -n '__clawd_using_command wallet' -a contacts -d 'List discovered recipient contacts'
complete -c clawd -n '__clawd_using_command wallet' -a find -d 'Find recipient contacts by name/address text'
complete -c clawd -n '__clawd_using_command wallet' -a earnings -d 'Show wallet earnings summary'
complete -c clawd -n '__clawd_using_command wallet' -a alias -d 'Manage recipient aliases'

complete -c clawd -n '__clawd_using_command wallet balance' -l address -d 'Wallet address'
complete -c clawd -n '__clawd_using_command wallet balance' -l denom -d 'Primary denom'
complete -c clawd -n '__clawd_using_command wallet balance' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command wallet send' -l denom -d 'Token denom'
complete -c clawd -n '__clawd_using_command wallet send' -l memo -d 'Optional tx memo'
complete -c clawd -n '__clawd_using_command wallet history' -l address -d 'Wallet address'
complete -c clawd -n '__clawd_using_command wallet history' -l limit -d 'Number of entries'
complete -c clawd -n '__clawd_using_command wallet history' -l cursor -d 'History cursor token'
complete -c clawd -n '__clawd_using_command wallet history' -l from -d 'tx-history backend base URL'
complete -c clawd -n '__clawd_using_command wallet history' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command wallet contacts' -l limit -d 'Maximum number of contacts'
complete -c clawd -n '__clawd_using_command wallet contacts' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command wallet find' -l limit -d 'Maximum number of contacts'
complete -c clawd -n '__clawd_using_command wallet find' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command wallet earnings' -l address -d 'Wallet address'
complete -c clawd -n '__clawd_using_command wallet earnings' -l window -d 'Window duration'
complete -c clawd -n '__clawd_using_command wallet earnings' -l from -d 'tx-history backend base URL'
complete -c clawd -n '__clawd_using_command wallet earnings' -l json -d 'Output JSON'

complete -c clawd -n '__clawd_using_command wallet alias' -a set -d 'Set alias mapping'
complete -c clawd -n '__clawd_using_command wallet alias' -a rm -d 'Remove alias mapping'
complete -c clawd -n '__clawd_using_command wallet alias' -a list -d 'List aliases'

# ---- autonomous subcommands ----
complete -c clawd -n '__clawd_using_command autonomous' -a show -d 'Show autonomous loop configuration'
complete -c clawd -n '__clawd_using_command autonomous' -a enable -d 'Enable autonomous loop'
complete -c clawd -n '__clawd_using_command autonomous' -a disable -d 'Disable autonomous loop'
complete -c clawd -n '__clawd_using_command autonomous' -a set-interval -d 'Set autonomous loop poll interval'
complete -c clawd -n '__clawd_using_command autonomous' -a set-auto-complete -d 'Enable or disable auto-complete'
complete -c clawd -n '__clawd_using_command autonomous' -a executor -d 'Manage global skill executor command'
complete -c clawd -n '__clawd_using_command autonomous' -a map -d 'Manage per-skill-id executor mapping'
complete -c clawd -n '__clawd_using_command autonomous' -a policy -d 'Manage acceptance and execution-budget policy'

complete -c clawd -n '__clawd_using_command autonomous executor' -a set -d 'Set global executor shell command'
complete -c clawd -n '__clawd_using_command autonomous executor' -a clear -d 'Clear global executor shell command'
complete -c clawd -n '__clawd_using_command autonomous executor' -a set-timeout -d 'Set executor timeout in seconds'

complete -c clawd -n '__clawd_using_command autonomous map' -a set -d 'Set per-skill executor command'
complete -c clawd -n '__clawd_using_command autonomous map' -a rm -d 'Remove per-skill executor command'
complete -c clawd -n '__clawd_using_command autonomous map' -a list -d 'List per-skill executor mapping'
complete -c clawd -n '__clawd_using_command autonomous map' -a sync -d 'Auto-discover skill executor mappings'
complete -c clawd -n '__clawd_using_command autonomous map sync' -l skills-roots -d 'Comma-separated roots to scan'
complete -c clawd -n '__clawd_using_command autonomous map sync' -l command-template -d 'Fallback command template'
complete -c clawd -n '__clawd_using_command autonomous map sync' -l id-map-json -d 'JSON mapping skill_name to skill_id'
complete -c clawd -n '__clawd_using_command autonomous map sync' -l require-all -d 'Fail if any skill is missing info'
complete -c clawd -n '__clawd_using_command autonomous map sync' -l clear -d 'Replace existing map instead of merging'
complete -c clawd -n '__clawd_using_command autonomous map sync' -l dry-run -d 'Print mappings without writing config'

complete -c clawd -n '__clawd_using_command autonomous policy' -a set-min-budget -d 'Set minimum task budget for auto-accept'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-min-profit -d 'Set minimum expected profit for auto-accept'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-max-accept-per-tick -d 'Set max tasks accepted per tick'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-max-pending-accepted -d 'Set max concurrently accepted tasks'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-allowed-skills -d 'Set skill-id allowlist for auto-accept'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-default-exec-cost -d 'Set default execution cost estimate'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-max-exec-cost-per-task -d 'Set hard execution-cost cap per task'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-max-exec-cost-per-tick -d 'Set hard execution-cost cap per tick'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-quality-weights -d 'Set quality scoring weights'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-quality-cache-ttl -d 'Set quality data cache TTL'
complete -c clawd -n '__clawd_using_command autonomous policy' -a set-min-quality-score -d 'Set minimum composite quality score'
complete -c clawd -n '__clawd_using_command autonomous policy set-quality-weights' -l reputation -d 'Relative weight for reputation'
complete -c clawd -n '__clawd_using_command autonomous policy set-quality-weights' -l success -d 'Relative weight for success-rate'
complete -c clawd -n '__clawd_using_command autonomous policy set-quality-weights' -l rating -d 'Relative weight for rating'

# ---- peers subcommands ----
complete -c clawd -n '__clawd_using_command peers' -a show -d 'Print this node peer address'
complete -c clawd -n '__clawd_using_command peers' -a set -d 'Update seed and persistent peer configuration'
complete -c clawd -n '__clawd_using_command peers' -a import-nodecards -d 'Import seed peers from nodecard JSON files/URLs'
complete -c clawd -n '__clawd_using_command peers' -a sync-manifest -d 'Sync seed peers from manifest.json'
complete -c clawd -n '__clawd_using_command peers' -a verify -d 'Verify configured seed peers are reachable'
complete -c clawd -n '__clawd_using_command peers' -a prune-unreachable -d 'Remove unreachable seed peers from config'
complete -c clawd -n '__clawd_using_command peers' -a auto-maintain -d 'Run peer maintenance cycle'
complete -c clawd -n '__clawd_using_command peers' -a summary -d 'Show configured seed peer summary'

complete -c clawd -n '__clawd_using_command peers show' -l host -d 'Host to display in the peer address'
complete -c clawd -n '__clawd_using_command peers set' -l seeds -d 'Comma-separated seed node addresses'
complete -c clawd -n '__clawd_using_command peers set' -l persistent-peers -d 'Comma-separated persistent peer addresses'
complete -c clawd -n '__clawd_using_command peers import-nodecards' -l replace -d 'Replace existing seeds instead of merging'
complete -c clawd -n '__clawd_using_command peers sync-manifest' -l from-manifest -d 'Manifest source'
complete -c clawd -n '__clawd_using_command peers sync-manifest' -l replace -d 'Replace existing seeds instead of merging'
complete -c clawd -n '__clawd_using_command peers verify' -l seeds -d 'Comma-separated seed peers to verify'
complete -c clawd -n '__clawd_using_command peers verify' -l timeout-ms -d 'TCP dial timeout in milliseconds'
complete -c clawd -n '__clawd_using_command peers prune-unreachable' -l timeout-ms -d 'TCP dial timeout in milliseconds'
complete -c clawd -n '__clawd_using_command peers prune-unreachable' -l dry-run -d 'Show changes without writing'
complete -c clawd -n '__clawd_using_command peers auto-maintain' -l from-manifest -d 'Manifest source for seed sync'
complete -c clawd -n '__clawd_using_command peers auto-maintain' -l replace-on-sync -d 'Replace seeds during sync'
complete -c clawd -n '__clawd_using_command peers auto-maintain' -l timeout-ms -d 'TCP dial timeout'
complete -c clawd -n '__clawd_using_command peers auto-maintain' -l dry-run -d 'Run prune in dry-run mode'
complete -c clawd -n '__clawd_using_command peers summary' -l out -d 'Output format: pretty|json'

# ---- incident subcommands ----
complete -c clawd -n '__clawd_using_command incident' -a enter -d 'Enter incident mode and isolate peers'
complete -c clawd -n '__clawd_using_command incident' -a status -d 'Show incident-mode status'
complete -c clawd -n '__clawd_using_command incident' -a exit -d 'Exit incident mode and restore peer config'

complete -c clawd -n '__clawd_using_command incident enter' -l reason -d 'Incident reason'
complete -c clawd -n '__clawd_using_command incident enter' -l no-peer-isolation -d 'Do not isolate peers'
complete -c clawd -n '__clawd_using_command incident enter' -l dry-run -d 'Preview changes without writing'
complete -c clawd -n '__clawd_using_command incident status' -l out -d 'Output format: pretty|json'
complete -c clawd -n '__clawd_using_command incident exit' -l no-restore-peers -d 'Do not restore pre-incident peers'
complete -c clawd -n '__clawd_using_command incident exit' -l dry-run -d 'Preview recovery changes'

# ---- faucet subcommands ----
complete -c clawd -n '__clawd_using_command faucet' -a request -d 'Request tokens from a faucet endpoint'
complete -c clawd -n '__clawd_using_command faucet' -a serve -d 'Start a faucet HTTP server'

complete -c clawd -n '__clawd_using_command faucet request' -l from -d 'Faucet URL'
complete -c clawd -n '__clawd_using_command faucet serve' -l port -d 'Port for the faucet server'
complete -c clawd -n '__clawd_using_command faucet serve' -l drip-amount -d 'Amount to drip per request'

# ---- agent subcommands ----
complete -c clawd -n '__clawd_using_command agent' -a register -d 'Register this node as an agent on-chain'
complete -c clawd -n '__clawd_using_command agent' -a info -d 'Query agent registration, stats, and liveness'
complete -c clawd -n '__clawd_using_command agent' -a tasks -d 'Query tasks assigned to or delegated by an agent'
complete -c clawd -n '__clawd_using_command agent' -a rewards -d 'Query cumulative agent rewards'
complete -c clawd -n '__clawd_using_command agent' -a heartbeat -d 'Send agent heartbeat to the network'

complete -c clawd -n '__clawd_using_command agent register' -l name -d 'Agent display name'
complete -c clawd -n '__clawd_using_command agent register' -l endpoint -d 'Agent messaging endpoint'
complete -c clawd -n '__clawd_using_command agent register' -l tools -d 'Comma-separated list of supported tools'
complete -c clawd -n '__clawd_using_command agent register' -l pricing-hint -d 'Pricing hint string'
complete -c clawd -n '__clawd_using_command agent register' -l version -d 'Agent version string'
complete -c clawd -n '__clawd_using_command agent info' -l address -d 'Agent bech32 address'
complete -c clawd -n '__clawd_using_command agent info' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command agent tasks' -l address -d 'Agent bech32 address'
complete -c clawd -n '__clawd_using_command agent tasks' -l role -d 'Filter: assigned, delegated, or all'
complete -c clawd -n '__clawd_using_command agent tasks' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command agent rewards' -l address -d 'Agent bech32 address'
complete -c clawd -n '__clawd_using_command agent rewards' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command agent heartbeat' -l endpoint -d 'Endpoint override'
complete -c clawd -n '__clawd_using_command agent heartbeat' -l metadata -d 'Heartbeat metadata'

# ---- gpu subcommands ----
complete -c clawd -n '__clawd_using_command gpu' -a list -d 'List available GPU compute resources'
complete -c clawd -n '__clawd_using_command gpu' -a lease -d 'Lease a GPU compute resource'
complete -c clawd -n '__clawd_using_command gpu' -a submit-job -d 'Submit a compute job to a leased GPU'
complete -c clawd -n '__clawd_using_command gpu' -a jobs -d 'List compute jobs'
complete -c clawd -n '__clawd_using_command gpu' -a status -d 'Get compute job status'
complete -c clawd -n '__clawd_using_command gpu' -a leases -d 'List compute leases'

complete -c clawd -n '__clawd_using_command gpu list' -l available -d 'Show only available resources'
complete -c clawd -n '__clawd_using_command gpu list' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command gpu lease' -l resource-id -d 'Resource ID to lease'
complete -c clawd -n '__clawd_using_command gpu lease' -l hours -d 'Number of hours to lease'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l resource-id -d 'Resource ID'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l lease-id -d 'Lease ID'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l name -d 'Job name'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l job-type -d 'Job type'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l execution-type -d 'Execution type'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l docker-image -d 'Docker image to run'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l script-content -d 'Inline script content'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l input-data-uri -d 'Input data URI'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l output-data-uri -d 'Output data URI'
complete -c clawd -n '__clawd_using_command gpu submit-job' -l params -d 'Additional parameters as JSON'
complete -c clawd -n '__clawd_using_command gpu jobs' -l address -d 'Filter by submitter address'
complete -c clawd -n '__clawd_using_command gpu jobs' -l resource-id -d 'Filter by resource ID'
complete -c clawd -n '__clawd_using_command gpu jobs' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command gpu status' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command gpu leases' -l address -d 'Filter by lessee address'
complete -c clawd -n '__clawd_using_command gpu leases' -l json -d 'Output JSON'

# ---- model subcommands ----
complete -c clawd -n '__clawd_using_command model' -a list -d 'List registered AI models'
complete -c clawd -n '__clawd_using_command model' -a query -d 'Get details of a specific model'
complete -c clawd -n '__clawd_using_command model' -a register -d 'Register a new model in the on-chain registry'
complete -c clawd -n '__clawd_using_command model' -a providers -d 'List inference providers'
complete -c clawd -n '__clawd_using_command model' -a inference -d 'Submit an inference request to a model'

complete -c clawd -n '__clawd_using_command model list' -l owner -d 'Filter by owner address'
complete -c clawd -n '__clawd_using_command model list' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command model query' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command model register' -l name -d 'Model name'
complete -c clawd -n '__clawd_using_command model register' -l description -d 'Model description'
complete -c clawd -n '__clawd_using_command model register' -l model-type -d 'Model type'
complete -c clawd -n '__clawd_using_command model register' -l access-type -d 'Access type'
complete -c clawd -n '__clawd_using_command model register' -l price-per-query -d 'Price per query in uclaw'
complete -c clawd -n '__clawd_using_command model register' -l endpoint -d 'Inference endpoint URL'
complete -c clawd -n '__clawd_using_command model providers' -l model-id -d 'Filter by model ID'
complete -c clawd -n '__clawd_using_command model providers' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command model inference' -l model-id -d 'Model ID'
complete -c clawd -n '__clawd_using_command model inference' -l input -d 'Inference input/prompt'
complete -c clawd -n '__clawd_using_command model inference' -l max-fee -d 'Maximum fee in uclaw'

# ---- skill subcommands ----
complete -c clawd -n '__clawd_using_command skill' -a list -d 'Browse or search marketplace skills'
complete -c clawd -n '__clawd_using_command skill' -a create -d 'List a new skill on the marketplace'
complete -c clawd -n '__clawd_using_command skill' -a purchase -d 'Purchase access to a marketplace skill'

complete -c clawd -n '__clawd_using_command skill list' -l category -d 'Filter by category'
complete -c clawd -n '__clawd_using_command skill list' -l search -d 'Search by keyword'
complete -c clawd -n '__clawd_using_command skill list' -l owner -d 'Filter by owner address'
complete -c clawd -n '__clawd_using_command skill list' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command skill create' -l name -d 'Skill name'
complete -c clawd -n '__clawd_using_command skill create' -l description -d 'Skill description'
complete -c clawd -n '__clawd_using_command skill create' -l price -d 'Price in uclaw'
complete -c clawd -n '__clawd_using_command skill create' -l denom -d 'Payment denom'
complete -c clawd -n '__clawd_using_command skill purchase' -l skill-id -d 'Skill ID to purchase'

# ---- escrow subcommands ----
complete -c clawd -n '__clawd_using_command escrow' -a list -d 'List escrows by buyer or seller address'
complete -c clawd -n '__clawd_using_command escrow' -a create -d 'Create a new escrow with a seller'
complete -c clawd -n '__clawd_using_command escrow' -a status -d 'Query a single escrow by ID'
complete -c clawd -n '__clawd_using_command escrow' -a complete -d 'Complete an escrow or milestone'
complete -c clawd -n '__clawd_using_command escrow' -a dispute -d 'Dispute an escrow'

complete -c clawd -n '__clawd_using_command escrow list' -l buyer -d 'Filter by buyer address'
complete -c clawd -n '__clawd_using_command escrow list' -l seller -d 'Filter by seller address'
complete -c clawd -n '__clawd_using_command escrow list' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command escrow create' -l seller -d 'Seller address'
complete -c clawd -n '__clawd_using_command escrow create' -l amount -d 'Escrow amount in uclaw'
complete -c clawd -n '__clawd_using_command escrow create' -l milestones -d 'Milestones JSON array'
complete -c clawd -n '__clawd_using_command escrow create' -l denom -d 'Payment denom'
complete -c clawd -n '__clawd_using_command escrow status' -l escrow-id -d 'Escrow ID'
complete -c clawd -n '__clawd_using_command escrow status' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command escrow complete' -l escrow-id -d 'Escrow ID'
complete -c clawd -n '__clawd_using_command escrow complete' -l milestone-index -d 'Specific milestone index'
complete -c clawd -n '__clawd_using_command escrow dispute' -l escrow-id -d 'Escrow ID'
complete -c clawd -n '__clawd_using_command escrow dispute' -l reason -d 'Reason for dispute'

# ---- reputation subcommands ----
complete -c clawd -n '__clawd_using_command reputation' -a query -d 'Query reputation for an agent address'
complete -c clawd -n '__clawd_using_command reputation' -a leaderboard -d 'Show top rated agents'
complete -c clawd -n '__clawd_using_command reputation' -a rate -d 'Rate an agent (1-5)'
complete -c clawd -n '__clawd_using_command reputation' -a endorse -d 'Endorse an agent'

complete -c clawd -n '__clawd_using_command reputation query' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command reputation leaderboard' -l limit -d 'Number of agents to show'
complete -c clawd -n '__clawd_using_command reputation leaderboard' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command reputation rate' -l rating -d 'Rating 1-5'
complete -c clawd -n '__clawd_using_command reputation rate' -l comment -d 'Optional comment'
complete -c clawd -n '__clawd_using_command reputation endorse' -l reason -d 'Endorsement reason'

# ---- intent subcommands ----
complete -c clawd -n '__clawd_using_command intent' -a submit -d 'Submit a coordination intent'
complete -c clawd -n '__clawd_using_command intent' -a respond -d 'Respond to a coordination intent'
complete -c clawd -n '__clawd_using_command intent' -a finalize -d 'Finalize an intent and select a respondent'
complete -c clawd -n '__clawd_using_command intent' -a list -d 'List coordination intents'
complete -c clawd -n '__clawd_using_command intent' -a query -d 'Query a specific intent by ID'

complete -c clawd -n '__clawd_using_command intent submit' -l description -d 'Intent description'
complete -c clawd -n '__clawd_using_command intent submit' -l required-capabilities -d 'Required agent capabilities'
complete -c clawd -n '__clawd_using_command intent submit' -l max-budget -d 'Maximum budget in uclaw'
complete -c clawd -n '__clawd_using_command intent submit' -l deadline -d 'Deadline in blocks'
complete -c clawd -n '__clawd_using_command intent respond' -l proposed-budget -d 'Proposed budget in uclaw'
complete -c clawd -n '__clawd_using_command intent respond' -l message -d 'Optional response message'
complete -c clawd -n '__clawd_using_command intent finalize' -l selected-agent -d 'Selected agent bech32 address'
complete -c clawd -n '__clawd_using_command intent list' -l address -d 'Filter by creator address'
complete -c clawd -n '__clawd_using_command intent list' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command intent query' -l json -d 'Output JSON'

# ---- task subcommands ----
complete -c clawd -n '__clawd_using_command task' -a delegate -d 'Delegate a task to another agent'
complete -c clawd -n '__clawd_using_command task' -a status -d 'Query task status and details'
complete -c clawd -n '__clawd_using_command task' -a accept -d 'Accept a delegated task'
complete -c clawd -n '__clawd_using_command task' -a complete -d 'Complete a task with result'

complete -c clawd -n '__clawd_using_command task delegate' -l assignee -d 'Assignee bech32 address'
complete -c clawd -n '__clawd_using_command task delegate' -l description -d 'Task description'
complete -c clawd -n '__clawd_using_command task delegate' -l requirements -d 'Task requirements'
complete -c clawd -n '__clawd_using_command task delegate' -l skill-id -d 'Required skill ID'
complete -c clawd -n '__clawd_using_command task delegate' -l budget -d 'Task budget in uclaw'
complete -c clawd -n '__clawd_using_command task delegate' -l deadline-blocks -d 'Deadline in blocks'
complete -c clawd -n '__clawd_using_command task status' -l task-id -d 'Task ID'
complete -c clawd -n '__clawd_using_command task status' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command task accept' -l task-id -d 'Task ID to accept'
complete -c clawd -n '__clawd_using_command task complete' -l task-id -d 'Task ID'
complete -c clawd -n '__clawd_using_command task complete' -l result -d 'Task result/output'

# ---- governance subcommands ----
complete -c clawd -n '__clawd_using_command governance' -a proposals -d 'List all governance proposals'
complete -c clawd -n '__clawd_using_command governance' -a proposal -d 'Get details for a single proposal'
complete -c clawd -n '__clawd_using_command governance' -a submit-proposal -d 'Submit a new text proposal'
complete -c clawd -n '__clawd_using_command governance' -a vote -d 'Vote on a proposal'
complete -c clawd -n '__clawd_using_command governance' -a params -d 'Query governance module parameters'

complete -c clawd -n '__clawd_using_command governance proposals' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command governance proposals' -l status -d 'Filter by proposal status'
complete -c clawd -n '__clawd_using_command governance proposal' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command governance submit-proposal' -l title -d 'Proposal title'
complete -c clawd -n '__clawd_using_command governance submit-proposal' -l description -d 'Proposal description'
complete -c clawd -n '__clawd_using_command governance submit-proposal' -l deposit -d 'Initial deposit in uclaw'
complete -c clawd -n '__clawd_using_command governance vote' -l proposal-id -d 'Proposal ID'
complete -c clawd -n '__clawd_using_command governance vote' -l option -d 'Vote option: yes, no, abstain, no_with_veto'
complete -c clawd -n '__clawd_using_command governance params' -l json -d 'Output JSON'

# ---- messaging subcommands ----
complete -c clawd -n '__clawd_using_command messaging' -a send -d 'Send an encrypted message'
complete -c clawd -n '__clawd_using_command messaging' -a inbox -d 'List received messages'
complete -c clawd -n '__clawd_using_command messaging' -a sent -d 'List sent messages'
complete -c clawd -n '__clawd_using_command messaging' -a read -d 'Read a specific message by ID'
complete -c clawd -n '__clawd_using_command messaging' -a ack -d 'Acknowledge receipt of a message'

complete -c clawd -n '__clawd_using_command messaging send' -l recipient -d 'Recipient bech32 address'
complete -c clawd -n '__clawd_using_command messaging send' -l content -d 'Message content'
complete -c clawd -n '__clawd_using_command messaging send' -l encrypt -d 'Encrypt the message content'
complete -c clawd -n '__clawd_using_command messaging inbox' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command messaging inbox' -l limit -d 'Max messages to show'
complete -c clawd -n '__clawd_using_command messaging sent' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command messaging sent' -l limit -d 'Max messages to show'
complete -c clawd -n '__clawd_using_command messaging read' -l json -d 'Output JSON'

# ---- negotiate subcommands ----
complete -c clawd -n '__clawd_using_command negotiate' -a propose -d 'Start a negotiation with another agent'
complete -c clawd -n '__clawd_using_command negotiate' -a counter -d 'Submit a counter-proposal'
complete -c clawd -n '__clawd_using_command negotiate' -a accept -d 'Accept a negotiation'
complete -c clawd -n '__clawd_using_command negotiate' -a list -d 'List active negotiations'
complete -c clawd -n '__clawd_using_command negotiate' -a reject -d 'Reject a negotiation'

complete -c clawd -n '__clawd_using_command negotiate propose' -l target-agent -d 'Counterparty agent bech32 address'
complete -c clawd -n '__clawd_using_command negotiate propose' -l task-description -d 'Description of the task'
complete -c clawd -n '__clawd_using_command negotiate propose' -l proposed-budget -d 'Proposed budget in uclaw'
complete -c clawd -n '__clawd_using_command negotiate propose' -l proposed-deadline -d 'Proposed deadline in blocks'
complete -c clawd -n '__clawd_using_command negotiate counter' -l counter-budget -d 'Counter-proposed budget in uclaw'
complete -c clawd -n '__clawd_using_command negotiate counter' -l counter-deadline -d 'Counter-proposed deadline in blocks'
complete -c clawd -n '__clawd_using_command negotiate counter' -l message -d 'Optional message'
complete -c clawd -n '__clawd_using_command negotiate list' -l address -d 'Filter by agent bech32 address'
complete -c clawd -n '__clawd_using_command negotiate list' -l json -d 'Output JSON'
complete -c clawd -n '__clawd_using_command negotiate reject' -l reason -d 'Optional rejection reason'

# ---- privacy subcommands ----
complete -c clawd -n '__clawd_using_command privacy' -a shield -d 'Shield tokens into the private pool'
complete -c clawd -n '__clawd_using_command privacy' -a unshield -d 'Unshield tokens from the private pool'
complete -c clawd -n '__clawd_using_command privacy' -a tree-stats -d 'Show Merkle tree statistics'
complete -c clawd -n '__clawd_using_command privacy' -a nullifier-check -d 'Check if a nullifier has been spent'
complete -c clawd -n '__clawd_using_command privacy' -a merkle-root -d 'Show current Merkle root'
complete -c clawd -n '__clawd_using_command privacy' -a root-history -d 'Show Merkle root history'

complete -c clawd -n '__clawd_using_command privacy shield' -l amount -s a -d 'Amount in uclaw to shield'
complete -c clawd -n '__clawd_using_command privacy unshield' -l commitment -s c -d 'Commitment to unshield'
complete -c clawd -n '__clawd_using_command privacy unshield' -l nullifier -s n -d 'Nullifier for the commitment'
complete -c clawd -n '__clawd_using_command privacy unshield' -l proof -s p -d 'ZK proof (hex-encoded)'
complete -c clawd -n '__clawd_using_command privacy unshield' -l amount -s a -d 'Amount in uclaw'
complete -c clawd -n '__clawd_using_command privacy unshield' -l root -s r -d 'Merkle root'
complete -c clawd -n '__clawd_using_command privacy unshield' -l recipient -d 'Recipient address'
complete -c clawd -n '__clawd_using_command privacy tree-stats' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command privacy nullifier-check' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command privacy merkle-root' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command privacy root-history' -l json -d 'Output as JSON'

# ---- staking subcommands ----
complete -c clawd -n '__clawd_using_command staking' -a validators -d 'List validators'
complete -c clawd -n '__clawd_using_command staking' -a delegations -d 'List your delegations'
complete -c clawd -n '__clawd_using_command staking' -a delegate -d 'Delegate tokens to a validator'
complete -c clawd -n '__clawd_using_command staking' -a undelegate -d 'Undelegate tokens from a validator'
complete -c clawd -n '__clawd_using_command staking' -a rewards -d 'Show pending staking rewards'
complete -c clawd -n '__clawd_using_command staking' -a claim-rewards -d 'Claim all pending staking rewards'

complete -c clawd -n '__clawd_using_command staking validators' -l status -d 'Filter by status'
complete -c clawd -n '__clawd_using_command staking validators' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command staking delegations' -l address -d 'Delegator address'
complete -c clawd -n '__clawd_using_command staking delegations' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command staking delegate' -l validator -s v -d 'Validator operator address'
complete -c clawd -n '__clawd_using_command staking delegate' -l amount -s a -d 'Amount in uclaw'
complete -c clawd -n '__clawd_using_command staking undelegate' -l validator -s v -d 'Validator operator address'
complete -c clawd -n '__clawd_using_command staking undelegate' -l amount -s a -d 'Amount in uclaw'
complete -c clawd -n '__clawd_using_command staking rewards' -l address -d 'Delegator address'
complete -c clawd -n '__clawd_using_command staking rewards' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command staking claim-rewards' -l validator -s v -d 'Claim from specific validator'

# ---- ibc subcommands ----
complete -c clawd -n '__clawd_using_command ibc' -a channels -d 'List IBC channels'
complete -c clawd -n '__clawd_using_command ibc' -a connections -d 'List IBC connections'
complete -c clawd -n '__clawd_using_command ibc' -a clients -d 'List IBC light clients'
complete -c clawd -n '__clawd_using_command ibc' -a remote-agents -d 'List agents discovered via IBC'
complete -c clawd -n '__clawd_using_command ibc' -a denoms -d 'List IBC denom traces'

complete -c clawd -n '__clawd_using_command ibc channels' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command ibc connections' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command ibc clients' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command ibc remote-agents' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command ibc denoms' -l json -d 'Output as JSON'

# ---- query subcommands ----
complete -c clawd -n '__clawd_using_command query' -a block -d 'Query a block by height'
complete -c clawd -n '__clawd_using_command query' -a tx -d 'Query a transaction by hash'
complete -c clawd -n '__clawd_using_command query' -a account -d 'Query account info, balances, delegations, agent status, and reputation'
complete -c clawd -n '__clawd_using_command query' -a supply -d 'Query total supply, staking pool, inflation, and community pool'
complete -c clawd -n '__clawd_using_command query' -a validators -d 'List bonded validators'

complete -c clawd -n '__clawd_using_command query block' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command query tx' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command query account' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command query supply' -l json -d 'Output as JSON'
complete -c clawd -n '__clawd_using_command query validators' -l json -d 'Output as JSON'

# ---- completion subcommands ----
complete -c clawd -n '__clawd_using_command completion' -a bash -d 'Output bash completion script'
complete -c clawd -n '__clawd_using_command completion' -a zsh -d 'Output zsh completion script'
complete -c clawd -n '__clawd_using_command completion' -a fish -d 'Output fish completion script'
