#compdef clawd
# Zsh completion script for clawd CLI
# Install: clawd completion zsh > ~/.zsh/completions/_clawd
#   then add ~/.zsh/completions to fpath and run compinit

_clawd() {
    local -a commands
    local curcontext="$curcontext" state line

    _arguments -C \
        '(-h --help)'{-h,--help}'[Show help]' \
        '(-V --version)'{-V,--version}'[Show version]' \
        '1:command:->command' \
        '*::arg:->args'

    case $state in
        command)
            commands=(
                'start:Start the chain node, OpenClaw gateway, and messaging server'
                'up:Initialize, optionally join a network, then start runtime'
                'init:Initialize a new ClawChain node/identity'
                'status:Check chain node, peers, and gateway health'
                'dashboard:Show comprehensive terminal dashboard'
                'join:Join an existing clawd network'
                'doctor:Run operator health diagnostics'
                'readiness:Run strict integrated runtime+chain readiness checks'
                'release-summary:Show release gate states from evidence artifact'
                'install-node:Install/manage local chain node auto-start service'
                'bootstrap:One-command operator onboarding'
                'nodecard:Print a shareable node descriptor'
                'keys:Manage chain keys (forwards to clawchaind)'
                'wallet:Simple wallet UX (balance, send, history, contacts, earnings)'
                'autonomous:Manage autonomous loop + skill executor settings'
                'peers:Manage peer discovery settings'
                'incident:Incident-mode controls'
                'faucet:Token faucet for testnet onboarding'
                'send:Send an encrypted message to another agent'
                'agent-flow:Run core agent lifecycle'
                'product-flow:Run end-to-end product flow'
                'agent:Manage agent registration and status'
                'gpu:GPU compute marketplace'
                'model:AI model registry'
                'skill:Marketplace skill listings'
                'escrow:Manage marketplace escrows'
                'reputation:Agent reputation and trust'
                'intent:Multi-agent intent coordination'
                'task:Manage agent task delegation'
                'governance:On-chain governance proposals and voting'
                'messaging:P2P encrypted messaging'
                'negotiate:Agent-to-agent negotiation protocol'
                'privacy:ZK privacy module'
                'staking:Proof-of-stake delegation and rewards'
                'ibc:IBC cross-chain queries'
                'query:Standard chain queries'
                'completion:Generate shell completion scripts'
            )
            _describe 'clawd command' commands
            ;;
        args)
            case ${words[1]} in
                start)
                    _arguments \
                        '--openclaw-bin[Path to the openclaw binary]:path:_files' \
                        '--node-binary[Path to the clawchaind binary]:path:_files' \
                        '--rpc-url[Blockchain RPC URL]:url' \
                        '--rest-url[Blockchain REST/LCD URL]:url' \
                        '--seeds[Comma-separated seed peers]:peers' \
                        '--persistent-peers[Comma-separated persistent peers]:peers' \
                        '--messaging-endpoint[Public agent messaging endpoint]:url' \
                        '--no-auto-start[Do not auto-start the chain node]' \
                        '--messaging-port[Port for the agent messaging server]:port'
                    ;;
                up)
                    _arguments \
                        '--openclaw-bin[Path to the openclaw binary]:path:_files' \
                        '--node-binary[Path to the clawchaind binary]:path:_files' \
                        '--messaging-port[Port for the agent messaging server]:port' \
                        '--no-auto-start[Do not auto-start the chain node]' \
                        '--skip-init[Do not run init if mnemonic is missing]' \
                        '--skip-join[Do not apply join/network configuration]' \
                        '--init-moniker[Moniker to use when auto-running init]:name' \
                        '--chain-id[Chain ID]:id' \
                        '--skip-setup[Skip ZK trusted setup]' \
                        '--from-manifest[Load config from manifest.json]:path:_files' \
                        '--from-nodecard[Load peer/endpoints from nodecard JSON]:path:_files' \
                        '--rpc-url[Blockchain RPC URL]:url' \
                        '--rest-url[Blockchain REST/LCD URL]:url' \
                        '--seeds[Comma-separated seed peers]:peers' \
                        '--persistent-peers[Comma-separated persistent peers]:peers' \
                        '--faucet-url[Faucet URL]:url' \
                        '--messaging-endpoint[Public messaging endpoint URL]:url' \
                        '--host[Public host/DNS]:host' \
                        '--no-sync-genesis[Do not download/verify/write genesis]' \
                        '--require-signed-manifest[Require trusted signature on manifest]' \
                        '--manifest-trusted-pubkeys[Comma-separated trusted pubkeys]:csv' \
                        '--request-faucet[Request starter tokens after join]' \
                        '--require-ready[Fail startup unless readiness passes]' \
                        '--skip-ready-gate[Disable default readiness gating]' \
                        '--ready-timeout-seconds[Readiness wait timeout in seconds]:seconds' \
                        '--json[Output machine-readable startup report]'
                    ;;
                init)
                    _arguments \
                        '--moniker[Node moniker]:name' \
                        '--chain-id[Chain ID]:id' \
                        '--node-binary[Path to the clawchaind binary]:path:_files' \
                        '--proof-binary[Path to the clawproof binary]:path:_files' \
                        '--skip-setup[Skip ZK trusted setup]' \
                        '--force[Force re-initialization]' \
                        '--seeds[Comma-separated seed node addresses]:seeds' \
                        '--persistent-peers[Comma-separated persistent peer addresses]:peers' \
                        '--initial-tokens[Initial token allocation]:amount' \
                        '--validator-stake[Validator stake amount]:amount' \
                        '--from-manifest[Apply join/bootstrap config from manifest]:path:_files' \
                        '--from-nodecard[Apply join/bootstrap config from nodecard]:path:_files' \
                        '--rpc-url[Override blockchain RPC URL]:url' \
                        '--rest-url[Override blockchain REST/LCD URL]:url' \
                        '--faucet-url[Faucet URL for bootstrap]:url' \
                        '--messaging-endpoint[Public messaging endpoint URL]:url' \
                        '--host[Public host/DNS]:host' \
                        '--no-sync-genesis[Skip manifest genesis sync]' \
                        '--request-faucet[Request starter tokens after bootstrap]'
                    ;;
                dashboard)
                    _arguments '--json[Output machine-readable JSON]'
                    ;;
                join)
                    _arguments \
                        '--from-manifest[Load config from manifest.json]:path:_files' \
                        '--from-nodecard[Load peer/endpoints from nodecard JSON]:path:_files' \
                        '--chain-id[Chain ID]:id' \
                        '--rpc-url[Blockchain RPC URL]:url' \
                        '--rest-url[Blockchain REST/LCD URL]:url' \
                        '--seeds[Comma-separated seed peers]:peers' \
                        '--persistent-peers[Comma-separated persistent peers]:peers' \
                        '--faucet-url[Faucet URL]:url' \
                        '--messaging-endpoint[Public messaging endpoint URL]:url' \
                        '--host[Public host/DNS]:host' \
                        '--no-sync-genesis[Do not download/verify/write genesis]' \
                        '--require-signed-manifest[Require trusted signature on manifest]' \
                        '--manifest-trusted-pubkeys[Comma-separated trusted pubkeys]:csv' \
                        '--request-faucet[Request starter tokens after join]'
                    ;;
                doctor)
                    _arguments '--json[Output machine-readable diagnostics]'
                    ;;
                readiness)
                    _arguments '--json[Output machine-readable readiness result]'
                    ;;
                release-summary)
                    _arguments \
                        '--json[Output machine-readable summary]' \
                        '--failed-only[Show only non-passing gates]'
                    ;;
                install-node)
                    _arguments \
                        '--binary-path[Path to clawchaind binary]:path:_files' \
                        '--node-home[clawchaind --home directory]:path:_directories' \
                        '--service-name[Service name]:name' \
                        '--build-local[Build clawchaind from local repo before install]' \
                        '--no-service[Skip service install and only update config]' \
                        '--no-start-now[Install service but do not start immediately]'
                    ;;
                bootstrap)
                    _arguments \
                        '--from-manifest[Load config from manifest.json]:path:_files' \
                        '--from-nodecard[Load peer/endpoints from nodecard JSON]:path:_files' \
                        '--chain-id[Chain ID]:id' \
                        '--rpc-url[Blockchain RPC URL]:url' \
                        '--rest-url[Blockchain REST/LCD URL]:url' \
                        '--seeds[Comma-separated seed peers]:peers' \
                        '--persistent-peers[Comma-separated persistent peers]:peers' \
                        '--faucet-url[Faucet URL]:url' \
                        '--messaging-endpoint[Public messaging endpoint URL]:url' \
                        '--host[Public host/DNS]:host' \
                        '--no-sync-genesis[Do not download/verify/write genesis]' \
                        '--require-signed-manifest[Require trusted signature on manifest]' \
                        '--manifest-trusted-pubkeys[Comma-separated trusted pubkeys]:csv' \
                        '--request-faucet[Request starter tokens after join]' \
                        '--binary-path[Path to clawchaind binary]:path:_files' \
                        '--node-home[clawchaind --home directory]:path:_directories' \
                        '--service-name[Service name]:name' \
                        '--build-local[Build clawchaind from local repo before install]' \
                        '--no-service[Skip service install and only update config]' \
                        '--no-start-now[Install service but do not start immediately]' \
                        '--require-ready[Wait for strict integrated readiness]' \
                        '--ready-timeout-seconds[Readiness wait timeout in seconds]:seconds'
                    ;;
                nodecard)
                    _arguments \
                        '--host[Public host for peer endpoint]:host' \
                        '--p2p-port[Public p2p port]:port' \
                        '--rpc-url[Override RPC URL]:url' \
                        '--rest-url[Override REST URL]:url' \
                        '--faucet-url[Override faucet URL]:url' \
                        '--messaging-endpoint[Override messaging endpoint URL]:url' \
                        '--write[Write nodecard JSON to file]:path:_files' \
                        '--out[Output format]:format:(json pretty)'
                    ;;
                agent-flow)
                    _arguments \
                        '--assignee[Task assignee bech32 address]:address' \
                        '--description[Task description]:text' \
                        '--requirements[Task requirements]:text' \
                        '--skill-id[Task skill ID]:id' \
                        '--budget[Task budget]:amount' \
                        '--deadline-blocks[Task deadline block delta]:blocks' \
                        '--endpoint[Heartbeat/registration endpoint override]:url' \
                        '--metadata[Heartbeat metadata override]:text' \
                        '--name[Registration name override]:name' \
                        '--json[Output machine-readable lifecycle result]' \
                        '--auto-accept[Auto-accept delegated task]' \
                        '--auto-complete[Auto-complete delegated task]' \
                        '--completion-result[Result payload for auto-complete]:text'
                    ;;
                product-flow)
                    _arguments \
                        '--assignee[Task assignee bech32 address]:address' \
                        '--task-description[Task description]:text' \
                        '--message-ciphertext[Encrypted on-chain message payload]:text' \
                        '--skill-id[Marketplace skill ID]:id' \
                        '--message-recipient[Message recipient]:address' \
                        '--message-nonce[On-chain message nonce]:text' \
                        '--escrow-description[Escrow description]:text' \
                        '--deadline-blocks[Escrow deadline block delta]:blocks' \
                        '--milestones[Escrow milestone count]:count' \
                        '--rating-score[Rating score 1..5]:score' \
                        '--rating-comment[Rating comment override]:text' \
                        '--endorsement-reason[Endorsement reason override]:text' \
                        '--endpoint[Heartbeat/registration endpoint override]:url' \
                        '--metadata[Heartbeat metadata override]:text' \
                        '--name[Registration name override]:name' \
                        '--json[Output machine-readable lifecycle result]'
                    ;;
                wallet)
                    local -a wallet_commands
                    wallet_commands=(
                        'balance:Show wallet balances'
                        'send:Send CLAW tokens'
                        'history:Show recent wallet transaction history'
                        'contacts:List discovered recipient contacts'
                        'find:Find recipient contacts by name/address text'
                        'earnings:Show wallet earnings summary'
                        'alias:Manage recipient aliases'
                    )
                    _arguments -C '1:subcommand:->wallet_sub' '*::arg:->wallet_args'
                    case $state in
                        wallet_sub)
                            _describe 'wallet subcommand' wallet_commands
                            ;;
                        wallet_args)
                            case ${words[1]} in
                                balance) _arguments '--address[Wallet address]:address' '--denom[Primary denom]:denom' '--json[Output JSON]' ;;
                                send) _arguments '1:to:' '2:amount:' '--denom[Token denom]:denom' '--memo[Optional tx memo]:text' ;;
                                history) _arguments '--address[Wallet address]:address' '--limit[Number of entries]:n' '--cursor[History cursor token]:cursor' '--from[tx-history backend base URL]:url' '--json[Output JSON]' ;;
                                contacts) _arguments '--limit[Maximum number of contacts]:n' '--json[Output JSON]' ;;
                                find) _arguments '1:query:' '--limit[Maximum number of contacts]:n' '--json[Output JSON]' ;;
                                earnings) _arguments '--address[Wallet address]:address' '--window[Window duration]:duration' '--from[tx-history backend base URL]:url' '--json[Output JSON]' ;;
                                alias)
                                    local -a alias_commands
                                    alias_commands=(
                                        'set:Set alias mapping'
                                        'rm:Remove alias mapping'
                                        'list:List aliases'
                                    )
                                    _arguments -C '1:subcommand:->alias_sub' '*::arg:->alias_args'
                                    case $state in
                                        alias_sub) _describe 'alias subcommand' alias_commands ;;
                                        alias_args)
                                            case ${words[1]} in
                                                set) _arguments '1:name:' '2:address:' ;;
                                                rm) _arguments '1:name:' ;;
                                            esac
                                            ;;
                                    esac
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                autonomous)
                    local -a auto_commands
                    auto_commands=(
                        'show:Show autonomous loop configuration'
                        'enable:Enable autonomous loop'
                        'disable:Disable autonomous loop'
                        'set-interval:Set autonomous loop poll interval'
                        'set-auto-complete:Enable or disable autonomous auto-complete'
                        'executor:Manage autonomous global skill executor command'
                        'map:Manage per-skill-id executor command mapping'
                        'policy:Manage autonomous acceptance and execution-budget policy'
                    )
                    _arguments -C '1:subcommand:->auto_sub' '*::arg:->auto_args'
                    case $state in
                        auto_sub)
                            _describe 'autonomous subcommand' auto_commands
                            ;;
                        auto_args)
                            case ${words[1]} in
                                set-interval) _arguments '1:seconds:' ;;
                                set-auto-complete) _arguments '1:mode:(on off)' ;;
                                executor)
                                    local -a exec_commands
                                    exec_commands=(
                                        'set:Set global executor shell command'
                                        'clear:Clear global executor shell command'
                                        'set-timeout:Set executor timeout in seconds'
                                    )
                                    _arguments -C '1:subcommand:->exec_sub' '*::arg:->exec_args'
                                    case $state in
                                        exec_sub) _describe 'executor subcommand' exec_commands ;;
                                        exec_args)
                                            case ${words[1]} in
                                                set) _arguments '1:command:' ;;
                                                set-timeout) _arguments '1:seconds:' ;;
                                            esac
                                            ;;
                                    esac
                                    ;;
                                map)
                                    local -a map_commands
                                    map_commands=(
                                        'set:Set per-skill executor command'
                                        'rm:Remove per-skill executor command'
                                        'list:List per-skill executor mapping'
                                        'sync:Auto-discover skill executor mappings'
                                    )
                                    _arguments -C '1:subcommand:->map_sub' '*::arg:->map_args'
                                    case $state in
                                        map_sub) _describe 'map subcommand' map_commands ;;
                                        map_args)
                                            case ${words[1]} in
                                                set) _arguments '1:skillId:' '2:command:' ;;
                                                rm) _arguments '1:skillId:' ;;
                                                sync) _arguments \
                                                    '--skills-roots[Comma-separated roots to scan]:csv' \
                                                    '--command-template[Fallback command template]:template' \
                                                    '--id-map-json[JSON object mapping skill_name to skill_id]:json' \
                                                    '--require-all[Fail if any discovered skill is missing info]' \
                                                    '--clear[Replace existing map instead of merging]' \
                                                    '--dry-run[Print discovered mappings without writing]' ;;
                                            esac
                                            ;;
                                    esac
                                    ;;
                                policy)
                                    local -a policy_commands
                                    policy_commands=(
                                        'set-min-budget:Set minimum task budget for auto-accept'
                                        'set-min-profit:Set minimum expected profit for auto-accept'
                                        'set-max-accept-per-tick:Set max tasks accepted per loop tick'
                                        'set-max-pending-accepted:Set max concurrently accepted tasks'
                                        'set-allowed-skills:Set skill-id allowlist for auto-accept'
                                        'set-default-exec-cost:Set default execution cost estimate'
                                        'set-max-exec-cost-per-task:Set hard execution-cost cap per task'
                                        'set-max-exec-cost-per-tick:Set hard execution-cost cap per tick'
                                        'set-quality-weights:Set quality scoring weights'
                                        'set-quality-cache-ttl:Set quality data cache TTL'
                                        'set-min-quality-score:Set minimum composite quality score'
                                    )
                                    _arguments -C '1:subcommand:->policy_sub' '*::arg:->policy_args'
                                    case $state in
                                        policy_sub) _describe 'policy subcommand' policy_commands ;;
                                        policy_args)
                                            case ${words[1]} in
                                                set-min-budget|set-min-profit|set-default-exec-cost|set-max-exec-cost-per-task|set-max-exec-cost-per-tick)
                                                    _arguments '1:uclaw:' ;;
                                                set-max-accept-per-tick|set-max-pending-accepted)
                                                    _arguments '1:count:' ;;
                                                set-allowed-skills)
                                                    _arguments '1:csv:' ;;
                                                set-quality-weights)
                                                    _arguments \
                                                        '--reputation[Relative weight for reputation signal]:bps' \
                                                        '--success[Relative weight for skill success-rate signal]:bps' \
                                                        '--rating[Relative weight for skill rating signal]:bps' ;;
                                                set-quality-cache-ttl)
                                                    _arguments '1:seconds:' ;;
                                                set-min-quality-score)
                                                    _arguments '1:bps:' ;;
                                            esac
                                            ;;
                                    esac
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                peers)
                    local -a peers_commands
                    peers_commands=(
                        'show:Print this node peer address'
                        'set:Update seed and persistent peer configuration'
                        'import-nodecards:Import seed peers from nodecard JSON files/URLs'
                        'sync-manifest:Sync seed peers from manifest.json'
                        'verify:Verify configured seed peers are reachable'
                        'prune-unreachable:Remove unreachable seed peers from config'
                        'auto-maintain:Run peer maintenance cycle'
                        'summary:Show configured seed peer summary'
                    )
                    _arguments -C '1:subcommand:->peers_sub' '*::arg:->peers_args'
                    case $state in
                        peers_sub)
                            _describe 'peers subcommand' peers_commands
                            ;;
                        peers_args)
                            case ${words[1]} in
                                show) _arguments '--host[Host to display]:host' ;;
                                set) _arguments '--seeds[Comma-separated seed node addresses]:seeds' '--persistent-peers[Comma-separated persistent peer addresses]:peers' ;;
                                import-nodecards) _arguments '*:sources:_files' '--replace[Replace existing seeds instead of merging]' ;;
                                sync-manifest) _arguments '--from-manifest[Manifest source]:path:_files' '--replace[Replace existing seeds instead of merging]' ;;
                                verify) _arguments '--seeds[Comma-separated seed peers]:seeds' '--timeout-ms[TCP dial timeout in milliseconds]:ms' ;;
                                prune-unreachable) _arguments '--timeout-ms[TCP dial timeout in milliseconds]:ms' '--dry-run[Show changes without writing]' ;;
                                auto-maintain) _arguments '--from-manifest[Manifest source]:path:_files' '--replace-on-sync[Replace seeds during sync]' '--timeout-ms[TCP dial timeout]:ms' '--dry-run[Run prune in dry-run mode]' ;;
                                summary) _arguments '--out[Output format]:format:(pretty json)' ;;
                            esac
                            ;;
                    esac
                    ;;
                incident)
                    local -a incident_commands
                    incident_commands=(
                        'enter:Enter incident mode and isolate peers'
                        'status:Show incident-mode status'
                        'exit:Exit incident mode and restore peer config'
                    )
                    _arguments -C '1:subcommand:->incident_sub' '*::arg:->incident_args'
                    case $state in
                        incident_sub)
                            _describe 'incident subcommand' incident_commands
                            ;;
                        incident_args)
                            case ${words[1]} in
                                enter) _arguments '--reason[Incident reason]:text' '--no-peer-isolation[Do not isolate peers]' '--dry-run[Preview changes without writing]' ;;
                                status) _arguments '--out[Output format]:format:(pretty json)' ;;
                                exit) _arguments '--no-restore-peers[Do not restore pre-incident peers]' '--dry-run[Preview recovery changes]' ;;
                            esac
                            ;;
                    esac
                    ;;
                faucet)
                    local -a faucet_commands
                    faucet_commands=(
                        'request:Request tokens from a faucet endpoint'
                        'serve:Start a faucet HTTP server'
                    )
                    _arguments -C '1:subcommand:->faucet_sub' '*::arg:->faucet_args'
                    case $state in
                        faucet_sub)
                            _describe 'faucet subcommand' faucet_commands
                            ;;
                        faucet_args)
                            case ${words[1]} in
                                request) _arguments '--from[Faucet URL]:url' ;;
                                serve) _arguments '--port[Port for the faucet server]:port' '--drip-amount[Amount to drip per request]:amount' ;;
                            esac
                            ;;
                    esac
                    ;;
                agent)
                    local -a agent_commands
                    agent_commands=(
                        'register:Register this node as an agent on-chain'
                        'info:Query agent registration, stats, and liveness'
                        'tasks:Query tasks assigned to or delegated by an agent'
                        'rewards:Query cumulative agent rewards'
                        'heartbeat:Send agent heartbeat to the network'
                    )
                    _arguments -C '1:subcommand:->agent_sub' '*::arg:->agent_args'
                    case $state in
                        agent_sub)
                            _describe 'agent subcommand' agent_commands
                            ;;
                        agent_args)
                            case ${words[1]} in
                                register) _arguments '--name[Agent display name]:name' '--endpoint[Agent messaging endpoint]:url' '--tools[Comma-separated list of supported tools]:tools' '--pricing-hint[Pricing hint string]:hint' '--version[Agent version string]:version' ;;
                                info) _arguments '--address[Agent bech32 address]:address' '--json[Output JSON]' ;;
                                tasks) _arguments '--address[Agent bech32 address]:address' '--role[Filter role]:role:(assigned delegated all)' '--json[Output JSON]' ;;
                                rewards) _arguments '--address[Agent bech32 address]:address' '--json[Output JSON]' ;;
                                heartbeat) _arguments '--endpoint[Endpoint override]:url' '--metadata[Heartbeat metadata]:text' ;;
                            esac
                            ;;
                    esac
                    ;;
                gpu)
                    local -a gpu_commands
                    gpu_commands=(
                        'list:List available GPU compute resources'
                        'lease:Lease a GPU compute resource'
                        'submit-job:Submit a compute job to a leased GPU'
                        'jobs:List compute jobs'
                        'status:Get compute job status'
                        'leases:List compute leases'
                    )
                    _arguments -C '1:subcommand:->gpu_sub' '*::arg:->gpu_args'
                    case $state in
                        gpu_sub)
                            _describe 'gpu subcommand' gpu_commands
                            ;;
                        gpu_args)
                            case ${words[1]} in
                                list) _arguments '--available[Show only available resources]' '--json[Output JSON]' ;;
                                lease) _arguments '--resource-id[Resource ID to lease]:id' '--hours[Number of hours]:hours' ;;
                                submit-job) _arguments '--resource-id[Resource ID]:id' '--lease-id[Lease ID]:id' '--name[Job name]:name' '--job-type[Job type]:type' '--execution-type[Execution type]:type' '--docker-image[Docker image]:image' '--script-content[Inline script content]:script' '--input-data-uri[Input data URI]:uri' '--output-data-uri[Output data URI]:uri' '--params[Additional parameters as JSON]:json' ;;
                                jobs) _arguments '--address[Filter by submitter address]:address' '--resource-id[Filter by resource ID]:id' '--json[Output JSON]' ;;
                                status) _arguments '1:jobId:' '--json[Output JSON]' ;;
                                leases) _arguments '--address[Filter by lessee address]:address' '--json[Output JSON]' ;;
                            esac
                            ;;
                    esac
                    ;;
                model)
                    local -a model_commands
                    model_commands=(
                        'list:List registered AI models'
                        'query:Get details of a specific model'
                        'register:Register a new model in the on-chain registry'
                        'providers:List inference providers'
                        'inference:Submit an inference request to a model'
                    )
                    _arguments -C '1:subcommand:->model_sub' '*::arg:->model_args'
                    case $state in
                        model_sub)
                            _describe 'model subcommand' model_commands
                            ;;
                        model_args)
                            case ${words[1]} in
                                list) _arguments '--owner[Filter by owner address]:address' '--json[Output JSON]' ;;
                                query) _arguments '1:modelId:' '--json[Output JSON]' ;;
                                register) _arguments '--name[Model name]:name' '--description[Model description]:text' '--model-type[Model type]:type:(llm diffusion classifier)' '--access-type[Access type]:type:(free per_query subscription)' '--price-per-query[Price per query in uclaw]:amount' '--endpoint[Inference endpoint URL]:url' ;;
                                providers) _arguments '--model-id[Filter by model ID]:id' '--json[Output JSON]' ;;
                                inference) _arguments '--model-id[Model ID]:id' '--input[Inference input/prompt]:text' '--max-fee[Maximum fee in uclaw]:amount' ;;
                            esac
                            ;;
                    esac
                    ;;
                skill)
                    local -a skill_commands
                    skill_commands=(
                        'list:Browse or search marketplace skills'
                        'create:List a new skill on the marketplace'
                        'purchase:Purchase access to a marketplace skill'
                    )
                    _arguments -C '1:subcommand:->skill_sub' '*::arg:->skill_args'
                    case $state in
                        skill_sub)
                            _describe 'skill subcommand' skill_commands
                            ;;
                        skill_args)
                            case ${words[1]} in
                                list) _arguments '--category[Filter by category]:category' '--search[Search by keyword]:term' '--owner[Filter by owner address]:address' '--json[Output JSON]' ;;
                                create) _arguments '--name[Skill name]:name' '--description[Skill description]:text' '--price[Price in uclaw]:amount' '--denom[Payment denom]:denom' ;;
                                purchase) _arguments '--skill-id[Skill ID to purchase]:id' ;;
                            esac
                            ;;
                    esac
                    ;;
                escrow)
                    local -a escrow_commands
                    escrow_commands=(
                        'list:List escrows by buyer or seller address'
                        'create:Create a new escrow with a seller'
                        'status:Query a single escrow by ID'
                        'complete:Complete an escrow or milestone'
                        'dispute:Dispute an escrow'
                    )
                    _arguments -C '1:subcommand:->escrow_sub' '*::arg:->escrow_args'
                    case $state in
                        escrow_sub)
                            _describe 'escrow subcommand' escrow_commands
                            ;;
                        escrow_args)
                            case ${words[1]} in
                                list) _arguments '--buyer[Filter by buyer address]:address' '--seller[Filter by seller address]:address' '--json[Output JSON]' ;;
                                create) _arguments '--seller[Seller address]:address' '--amount[Escrow amount in uclaw]:amount' '--milestones[Milestones JSON array]:json' '--denom[Payment denom]:denom' ;;
                                status) _arguments '--escrow-id[Escrow ID]:id' '--json[Output JSON]' ;;
                                complete) _arguments '--escrow-id[Escrow ID]:id' '--milestone-index[Specific milestone index]:index' ;;
                                dispute) _arguments '--escrow-id[Escrow ID]:id' '--reason[Reason for dispute]:text' ;;
                            esac
                            ;;
                    esac
                    ;;
                reputation)
                    local -a reputation_commands
                    reputation_commands=(
                        'query:Query reputation for an agent address'
                        'leaderboard:Show top rated agents'
                        'rate:Rate an agent (1-5)'
                        'endorse:Endorse an agent'
                    )
                    _arguments -C '1:subcommand:->reputation_sub' '*::arg:->reputation_args'
                    case $state in
                        reputation_sub)
                            _describe 'reputation subcommand' reputation_commands
                            ;;
                        reputation_args)
                            case ${words[1]} in
                                query) _arguments '1:address:' '--json[Output JSON]' ;;
                                leaderboard) _arguments '--limit[Number of agents to show]:n' '--json[Output JSON]' ;;
                                rate) _arguments '1:address:' '--rating[Rating 1-5]:rating:(1 2 3 4 5)' '--comment[Optional comment]:text' ;;
                                endorse) _arguments '1:address:' '--reason[Endorsement reason]:text' ;;
                            esac
                            ;;
                    esac
                    ;;
                intent)
                    local -a intent_commands
                    intent_commands=(
                        'submit:Submit a coordination intent'
                        'respond:Respond to a coordination intent'
                        'finalize:Finalize an intent and select a respondent'
                        'list:List coordination intents'
                        'query:Query a specific intent by ID'
                    )
                    _arguments -C '1:subcommand:->intent_sub' '*::arg:->intent_args'
                    case $state in
                        intent_sub)
                            _describe 'intent subcommand' intent_commands
                            ;;
                        intent_args)
                            case ${words[1]} in
                                submit) _arguments '--description[Intent description]:text' '--required-capabilities[Required agent capabilities]:caps' '--max-budget[Maximum budget in uclaw]:amount' '--deadline[Deadline in blocks]:blocks' ;;
                                respond) _arguments '1:intentId:' '--proposed-budget[Proposed budget in uclaw]:amount' '--message[Optional response message]:text' ;;
                                finalize) _arguments '1:intentId:' '--selected-agent[Selected agent bech32 address]:address' ;;
                                list) _arguments '--address[Filter by creator address]:address' '--json[Output JSON]' ;;
                                query) _arguments '1:intentId:' '--json[Output JSON]' ;;
                            esac
                            ;;
                    esac
                    ;;
                task)
                    local -a task_commands
                    task_commands=(
                        'delegate:Delegate a task to another agent'
                        'status:Query task status and details'
                        'accept:Accept a delegated task'
                        'complete:Complete a task with result'
                    )
                    _arguments -C '1:subcommand:->task_sub' '*::arg:->task_args'
                    case $state in
                        task_sub)
                            _describe 'task subcommand' task_commands
                            ;;
                        task_args)
                            case ${words[1]} in
                                delegate) _arguments '--assignee[Assignee bech32 address]:address' '--description[Task description]:text' '--requirements[Task requirements]:text' '--skill-id[Required skill ID]:id' '--budget[Task budget in uclaw]:amount' '--deadline-blocks[Deadline in blocks]:blocks' ;;
                                status) _arguments '--task-id[Task ID]:id' '--json[Output JSON]' ;;
                                accept) _arguments '--task-id[Task ID to accept]:id' ;;
                                complete) _arguments '--task-id[Task ID]:id' '--result[Task result/output]:text' ;;
                            esac
                            ;;
                    esac
                    ;;
                governance)
                    local -a governance_commands
                    governance_commands=(
                        'proposals:List all governance proposals'
                        'proposal:Get details for a single proposal'
                        'submit-proposal:Submit a new text proposal'
                        'vote:Vote on a proposal'
                        'params:Query governance module parameters'
                    )
                    _arguments -C '1:subcommand:->gov_sub' '*::arg:->gov_args'
                    case $state in
                        gov_sub)
                            _describe 'governance subcommand' governance_commands
                            ;;
                        gov_args)
                            case ${words[1]} in
                                proposals) _arguments '--json[Output JSON]' '--status[Filter by proposal status]:status' ;;
                                proposal) _arguments '1:id:' '--json[Output JSON]' ;;
                                submit-proposal) _arguments '--title[Proposal title]:title' '--description[Proposal description]:text' '--deposit[Initial deposit in uclaw]:amount' ;;
                                vote) _arguments '--proposal-id[Proposal ID]:id' '--option[Vote option]:option:(yes no abstain no_with_veto)' ;;
                                params) _arguments '--json[Output JSON]' ;;
                            esac
                            ;;
                    esac
                    ;;
                messaging)
                    local -a messaging_commands
                    messaging_commands=(
                        'send:Send an encrypted message to another agent'
                        'inbox:List received messages'
                        'sent:List sent messages'
                        'read:Read a specific message by ID'
                        'ack:Acknowledge receipt of a message'
                    )
                    _arguments -C '1:subcommand:->msg_sub' '*::arg:->msg_args'
                    case $state in
                        msg_sub)
                            _describe 'messaging subcommand' messaging_commands
                            ;;
                        msg_args)
                            case ${words[1]} in
                                send) _arguments '--recipient[Recipient bech32 address]:address' '--content[Message content]:text' '--encrypt[Encrypt the message content]' ;;
                                inbox) _arguments '--json[Output JSON]' '--limit[Max messages to show]:n' ;;
                                sent) _arguments '--json[Output JSON]' '--limit[Max messages to show]:n' ;;
                                read) _arguments '1:messageId:' '--json[Output JSON]' ;;
                                ack) _arguments '1:messageId:' ;;
                            esac
                            ;;
                    esac
                    ;;
                negotiate)
                    local -a negotiate_commands
                    negotiate_commands=(
                        'propose:Start a negotiation with another agent'
                        'counter:Submit a counter-proposal on an existing negotiation'
                        'accept:Accept a negotiation'
                        'list:List active negotiations'
                        'reject:Reject a negotiation'
                    )
                    _arguments -C '1:subcommand:->neg_sub' '*::arg:->neg_args'
                    case $state in
                        neg_sub)
                            _describe 'negotiate subcommand' negotiate_commands
                            ;;
                        neg_args)
                            case ${words[1]} in
                                propose) _arguments '--target-agent[Counterparty agent bech32 address]:address' '--task-description[Description of the task]:text' '--proposed-budget[Proposed budget in uclaw]:amount' '--proposed-deadline[Proposed deadline in blocks]:blocks' ;;
                                counter) _arguments '1:negotiationId:' '--counter-budget[Counter-proposed budget in uclaw]:amount' '--counter-deadline[Counter-proposed deadline in blocks]:blocks' '--message[Optional message]:text' ;;
                                accept) _arguments '1:negotiationId:' ;;
                                list) _arguments '--address[Filter by agent bech32 address]:address' '--json[Output JSON]' ;;
                                reject) _arguments '1:negotiationId:' '--reason[Optional rejection reason]:text' ;;
                            esac
                            ;;
                    esac
                    ;;
                privacy)
                    local -a privacy_commands
                    privacy_commands=(
                        'shield:Shield tokens into the private pool'
                        'unshield:Unshield tokens from the private pool'
                        'tree-stats:Show Merkle tree statistics'
                        'nullifier-check:Check if a nullifier has been spent'
                        'merkle-root:Show current Merkle root'
                        'root-history:Show Merkle root history'
                    )
                    _arguments -C '1:subcommand:->priv_sub' '*::arg:->priv_args'
                    case $state in
                        priv_sub)
                            _describe 'privacy subcommand' privacy_commands
                            ;;
                        priv_args)
                            case ${words[1]} in
                                shield) _arguments '(-a --amount)'{-a,--amount}'[Amount in uclaw to shield]:amount' ;;
                                unshield) _arguments '(-c --commitment)'{-c,--commitment}'[Commitment to unshield]:hex' '(-n --nullifier)'{-n,--nullifier}'[Nullifier for the commitment]:hex' '(-p --proof)'{-p,--proof}'[ZK proof (hex-encoded)]:hex' '(-a --amount)'{-a,--amount}'[Amount in uclaw]:amount' '(-r --root)'{-r,--root}'[Merkle root]:hex' '--recipient[Recipient address]:address' ;;
                                tree-stats) _arguments '--json[Output as JSON]' ;;
                                nullifier-check) _arguments '1:nullifier:' '--json[Output as JSON]' ;;
                                merkle-root) _arguments '--json[Output as JSON]' ;;
                                root-history) _arguments '--json[Output as JSON]' ;;
                            esac
                            ;;
                    esac
                    ;;
                staking)
                    local -a staking_commands
                    staking_commands=(
                        'validators:List validators'
                        'delegations:List your delegations'
                        'delegate:Delegate tokens to a validator'
                        'undelegate:Undelegate tokens from a validator'
                        'rewards:Show pending staking rewards'
                        'claim-rewards:Claim all pending staking rewards'
                    )
                    _arguments -C '1:subcommand:->staking_sub' '*::arg:->staking_args'
                    case $state in
                        staking_sub)
                            _describe 'staking subcommand' staking_commands
                            ;;
                        staking_args)
                            case ${words[1]} in
                                validators) _arguments '--status[Filter by status]:status:(BOND_STATUS_BONDED BOND_STATUS_UNBONDED)' '--json[Output as JSON]' ;;
                                delegations) _arguments '--address[Delegator address]:address' '--json[Output as JSON]' ;;
                                delegate) _arguments '(-v --validator)'{-v,--validator}'[Validator operator address]:valoper' '(-a --amount)'{-a,--amount}'[Amount in uclaw]:amount' ;;
                                undelegate) _arguments '(-v --validator)'{-v,--validator}'[Validator operator address]:valoper' '(-a --amount)'{-a,--amount}'[Amount in uclaw]:amount' ;;
                                rewards) _arguments '--address[Delegator address]:address' '--json[Output as JSON]' ;;
                                claim-rewards) _arguments '(-v --validator)'{-v,--validator}'[Claim from specific validator]:valoper' ;;
                            esac
                            ;;
                    esac
                    ;;
                ibc)
                    local -a ibc_commands
                    ibc_commands=(
                        'channels:List IBC channels'
                        'connections:List IBC connections'
                        'clients:List IBC light clients'
                        'remote-agents:List agents discovered via IBC'
                        'denoms:List IBC denom traces'
                    )
                    _arguments -C '1:subcommand:->ibc_sub' '*::arg:->ibc_args'
                    case $state in
                        ibc_sub)
                            _describe 'ibc subcommand' ibc_commands
                            ;;
                        ibc_args)
                            case ${words[1]} in
                                channels|connections|clients|remote-agents|denoms)
                                    _arguments '--json[Output as JSON]'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                query)
                    local -a query_commands
                    query_commands=(
                        'block:Query a block by height'
                        'tx:Query a transaction by hash'
                        'account:Query account info, balances, delegations, agent status, and reputation'
                        'supply:Query total supply, staking pool, inflation, and community pool'
                        'validators:List bonded validators with rank, tokens, and commission'
                    )
                    _arguments -C '1:subcommand:->query_sub' '*::arg:->query_args'
                    case $state in
                        query_sub)
                            _describe 'query subcommand' query_commands
                            ;;
                        query_args)
                            case ${words[1]} in
                                block) _arguments '1::height:' '--json[Output as JSON]' ;;
                                tx) _arguments '1:hash:' '--json[Output as JSON]' ;;
                                account) _arguments '1:address:' '--json[Output as JSON]' ;;
                                supply) _arguments '--json[Output as JSON]' ;;
                                validators) _arguments '--json[Output as JSON]' ;;
                            esac
                            ;;
                    esac
                    ;;
                completion)
                    local -a completion_commands
                    completion_commands=(
                        'bash:Output bash completion script'
                        'zsh:Output zsh completion script'
                        'fish:Output fish completion script'
                    )
                    _describe 'shell' completion_commands
                    ;;
            esac
            ;;
    esac
}

_clawd "$@"
