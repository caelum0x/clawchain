#!/usr/bin/env bash
# Bash completion script for clawd CLI
# Install: eval "$(clawd completion bash)"
#   or: clawd completion bash > /usr/local/etc/bash_completion.d/clawd

_clawd() {
    local cur prev words cword
    _init_completion || return

    # Top-level commands
    local toplevel_commands="start up init status dashboard join doctor readiness release-summary install-node bootstrap nodecard keys wallet autonomous peers incident faucet send agent-flow product-flow agent gpu model skill escrow reputation intent task governance messaging negotiate ibc query completion"

    # Subcommands per parent command
    local wallet_subcommands="balance send history contacts find earnings alias"
    local wallet_alias_subcommands="set rm list"
    local autonomous_subcommands="show enable disable set-interval set-auto-complete executor map policy"
    local autonomous_executor_subcommands="set clear set-timeout"
    local autonomous_map_subcommands="set rm list sync"
    local autonomous_policy_subcommands="set-min-budget set-min-profit set-max-accept-per-tick set-max-pending-accepted set-allowed-skills set-default-exec-cost set-max-exec-cost-per-task set-max-exec-cost-per-tick set-quality-weights set-quality-cache-ttl set-min-quality-score"
    local peers_subcommands="show set import-nodecards sync-manifest verify prune-unreachable auto-maintain summary"
    local incident_subcommands="enter status exit"
    local faucet_subcommands="request serve"
    local agent_subcommands="register info tasks rewards heartbeat"
    local gpu_subcommands="list lease submit-job jobs status leases"
    local model_subcommands="list query register providers inference"
    local skill_subcommands="list create purchase"
    local escrow_subcommands="list create status complete dispute"
    local reputation_subcommands="query leaderboard rate endorse"
    local intent_subcommands="submit respond finalize list query"
    local task_subcommands="delegate status accept complete"
    local governance_subcommands="proposals proposal submit-proposal vote params"
    local messaging_subcommands="send inbox sent read ack"
    local negotiate_subcommands="propose counter accept list reject"
    local ibc_subcommands="channels connections clients remote-agents denoms"
    local query_subcommands="block tx account supply validators"
    local privacy_subcommands="shield unshield tree-stats nullifier-check merkle-root root-history"
    local staking_subcommands="validators delegations delegate undelegate rewards claim-rewards"
    local completion_subcommands="bash zsh fish"

    # Global flags
    local global_flags="--help --version -h -V"

    # Common flags used across many commands
    local json_flag="--json"
    local address_flag="--address"

    # Determine where we are in the command line
    local cmd=""
    local subcmd=""
    local subsubcmd=""
    local i
    for ((i = 1; i < cword; i++)); do
        case "${words[i]}" in
            -*)
                continue
                ;;
            *)
                if [[ -z "$cmd" ]]; then
                    cmd="${words[i]}"
                elif [[ -z "$subcmd" ]]; then
                    subcmd="${words[i]}"
                elif [[ -z "$subsubcmd" ]]; then
                    subsubcmd="${words[i]}"
                fi
                ;;
        esac
    done

    # Handle flag completions
    if [[ "$cur" == -* ]]; then
        local flags="$global_flags"
        case "$cmd" in
            start)
                flags="$flags --openclaw-bin --node-binary --rpc-url --rest-url --seeds --persistent-peers --messaging-endpoint --no-auto-start --messaging-port"
                ;;
            up)
                flags="$flags --openclaw-bin --node-binary --messaging-port --no-auto-start --skip-init --skip-join --init-moniker --chain-id --skip-setup --from-manifest --from-nodecard --rpc-url --rest-url --seeds --persistent-peers --faucet-url --messaging-endpoint --host --no-sync-genesis --require-signed-manifest --manifest-trusted-pubkeys --request-faucet --require-ready --skip-ready-gate --ready-timeout-seconds --json"
                ;;
            init)
                flags="$flags --moniker --chain-id --node-binary --proof-binary --skip-setup --force --seeds --persistent-peers --initial-tokens --validator-stake --from-manifest --from-nodecard --rpc-url --rest-url --faucet-url --messaging-endpoint --host --no-sync-genesis --request-faucet"
                ;;
            status)
                flags="$flags"
                ;;
            dashboard)
                flags="$flags --json"
                ;;
            join)
                flags="$flags --from-manifest --from-nodecard --chain-id --rpc-url --rest-url --seeds --persistent-peers --faucet-url --messaging-endpoint --host --no-sync-genesis --require-signed-manifest --manifest-trusted-pubkeys --request-faucet"
                ;;
            doctor)
                flags="$flags --json"
                ;;
            readiness)
                flags="$flags --json"
                ;;
            release-summary)
                flags="$flags --json --failed-only"
                ;;
            install-node)
                flags="$flags --binary-path --node-home --service-name --build-local --no-service --no-start-now"
                ;;
            bootstrap)
                flags="$flags --from-manifest --from-nodecard --chain-id --rpc-url --rest-url --seeds --persistent-peers --faucet-url --messaging-endpoint --host --no-sync-genesis --require-signed-manifest --manifest-trusted-pubkeys --request-faucet --binary-path --node-home --service-name --build-local --no-service --no-start-now --require-ready --ready-timeout-seconds"
                ;;
            nodecard)
                flags="$flags --host --p2p-port --rpc-url --rest-url --faucet-url --messaging-endpoint --write --out"
                ;;
            agent-flow)
                flags="$flags --assignee --description --requirements --skill-id --budget --deadline-blocks --endpoint --metadata --name --json --auto-accept --auto-complete --completion-result"
                ;;
            product-flow)
                flags="$flags --assignee --task-description --message-ciphertext --skill-id --message-recipient --message-nonce --escrow-description --deadline-blocks --milestones --rating-score --rating-comment --endorsement-reason --endpoint --metadata --name --json"
                ;;
            wallet)
                case "$subcmd" in
                    balance) flags="$flags --address --denom --json" ;;
                    send) flags="$flags --denom --memo" ;;
                    history) flags="$flags --address --limit --cursor --from --json" ;;
                    contacts) flags="$flags --limit --json" ;;
                    find) flags="$flags --limit --json" ;;
                    earnings) flags="$flags --address --window --from --json" ;;
                esac
                ;;
            agent)
                case "$subcmd" in
                    register) flags="$flags --name --endpoint --tools --pricing-hint --version" ;;
                    info) flags="$flags --address --json" ;;
                    tasks) flags="$flags --address --role --json" ;;
                    rewards) flags="$flags --address --json" ;;
                    heartbeat) flags="$flags --endpoint --metadata" ;;
                esac
                ;;
            gpu)
                case "$subcmd" in
                    list) flags="$flags --available --json" ;;
                    lease) flags="$flags --resource-id --hours" ;;
                    submit-job) flags="$flags --resource-id --lease-id --name --job-type --execution-type --docker-image --script-content --input-data-uri --output-data-uri --params" ;;
                    jobs) flags="$flags --address --resource-id --json" ;;
                    status) flags="$flags --json" ;;
                    leases) flags="$flags --address --json" ;;
                esac
                ;;
            model)
                case "$subcmd" in
                    list) flags="$flags --owner --json" ;;
                    query) flags="$flags --json" ;;
                    register) flags="$flags --name --description --model-type --access-type --price-per-query --endpoint" ;;
                    providers) flags="$flags --model-id --json" ;;
                    inference) flags="$flags --model-id --input --max-fee" ;;
                esac
                ;;
            skill)
                case "$subcmd" in
                    list) flags="$flags --category --search --owner --json" ;;
                    create) flags="$flags --name --description --price --denom" ;;
                    purchase) flags="$flags --skill-id" ;;
                esac
                ;;
            escrow)
                case "$subcmd" in
                    list) flags="$flags --buyer --seller --json" ;;
                    create) flags="$flags --seller --amount --milestones --denom" ;;
                    status) flags="$flags --escrow-id --json" ;;
                    complete) flags="$flags --escrow-id --milestone-index" ;;
                    dispute) flags="$flags --escrow-id --reason" ;;
                esac
                ;;
            reputation)
                case "$subcmd" in
                    query) flags="$flags --json" ;;
                    leaderboard) flags="$flags --limit --json" ;;
                    rate) flags="$flags --rating --comment" ;;
                    endorse) flags="$flags --reason" ;;
                esac
                ;;
            intent)
                case "$subcmd" in
                    submit) flags="$flags --description --required-capabilities --max-budget --deadline" ;;
                    respond) flags="$flags --proposed-budget --message" ;;
                    finalize) flags="$flags --selected-agent" ;;
                    list) flags="$flags --address --json" ;;
                    query) flags="$flags --json" ;;
                esac
                ;;
            task)
                case "$subcmd" in
                    delegate) flags="$flags --assignee --description --requirements --skill-id --budget --deadline-blocks" ;;
                    status) flags="$flags --task-id --json" ;;
                    accept) flags="$flags --task-id" ;;
                    complete) flags="$flags --task-id --result" ;;
                esac
                ;;
            governance)
                case "$subcmd" in
                    proposals) flags="$flags --json --status" ;;
                    proposal) flags="$flags --json" ;;
                    submit-proposal) flags="$flags --title --description --deposit" ;;
                    vote) flags="$flags --proposal-id --option" ;;
                    params) flags="$flags --json" ;;
                esac
                ;;
            messaging)
                case "$subcmd" in
                    send) flags="$flags --recipient --content --encrypt" ;;
                    inbox) flags="$flags --json --limit" ;;
                    sent) flags="$flags --json --limit" ;;
                    read) flags="$flags --json" ;;
                esac
                ;;
            negotiate)
                case "$subcmd" in
                    propose) flags="$flags --target-agent --task-description --proposed-budget --proposed-deadline" ;;
                    counter) flags="$flags --counter-budget --counter-deadline --message" ;;
                    list) flags="$flags --address --json" ;;
                    reject) flags="$flags --reason" ;;
                esac
                ;;
            privacy)
                case "$subcmd" in
                    shield) flags="$flags -a --amount" ;;
                    unshield) flags="$flags -c --commitment -n --nullifier -p --proof -a --amount -r --root --recipient" ;;
                    tree-stats) flags="$flags --json" ;;
                    nullifier-check) flags="$flags --json" ;;
                    merkle-root) flags="$flags --json" ;;
                    root-history) flags="$flags --json" ;;
                esac
                ;;
            staking)
                case "$subcmd" in
                    validators) flags="$flags --status --json" ;;
                    delegations) flags="$flags --address --json" ;;
                    delegate) flags="$flags -v --validator -a --amount" ;;
                    undelegate) flags="$flags -v --validator -a --amount" ;;
                    rewards) flags="$flags --address --json" ;;
                    claim-rewards) flags="$flags -v --validator" ;;
                esac
                ;;
            ibc)
                case "$subcmd" in
                    channels|connections|clients|remote-agents|denoms)
                        flags="$flags --json"
                        ;;
                esac
                ;;
            query)
                case "$subcmd" in
                    block|tx|account|supply|validators)
                        flags="$flags --json"
                        ;;
                esac
                ;;
            peers)
                case "$subcmd" in
                    show) flags="$flags --host" ;;
                    set) flags="$flags --seeds --persistent-peers" ;;
                    import-nodecards) flags="$flags --replace" ;;
                    sync-manifest) flags="$flags --from-manifest --replace" ;;
                    verify) flags="$flags --seeds --timeout-ms" ;;
                    prune-unreachable) flags="$flags --timeout-ms --dry-run" ;;
                    auto-maintain) flags="$flags --from-manifest --replace-on-sync --timeout-ms --dry-run" ;;
                    summary) flags="$flags --out" ;;
                esac
                ;;
            incident)
                case "$subcmd" in
                    enter) flags="$flags --reason --no-peer-isolation --dry-run" ;;
                    status) flags="$flags --out" ;;
                    exit) flags="$flags --no-restore-peers --dry-run" ;;
                esac
                ;;
            faucet)
                case "$subcmd" in
                    request) flags="$flags --from" ;;
                    serve) flags="$flags --port --drip-amount" ;;
                esac
                ;;
            autonomous)
                case "$subcmd" in
                    map)
                        case "$subsubcmd" in
                            sync) flags="$flags --skills-roots --command-template --id-map-json --require-all --clear --dry-run" ;;
                        esac
                        ;;
                    policy)
                        case "$subsubcmd" in
                            set-quality-weights) flags="$flags --reputation --success --rating" ;;
                        esac
                        ;;
                esac
                ;;
        esac
        COMPREPLY=($(compgen -W "$flags" -- "$cur"))
        return
    fi

    # Complete subcommands based on context
    case "$cmd" in
        "")
            COMPREPLY=($(compgen -W "$toplevel_commands" -- "$cur"))
            ;;
        wallet)
            if [[ -z "$subcmd" ]]; then
                COMPREPLY=($(compgen -W "$wallet_subcommands" -- "$cur"))
            elif [[ "$subcmd" == "alias" && -z "$subsubcmd" ]]; then
                COMPREPLY=($(compgen -W "$wallet_alias_subcommands" -- "$cur"))
            fi
            ;;
        autonomous)
            if [[ -z "$subcmd" ]]; then
                COMPREPLY=($(compgen -W "$autonomous_subcommands" -- "$cur"))
            elif [[ "$subcmd" == "executor" && -z "$subsubcmd" ]]; then
                COMPREPLY=($(compgen -W "$autonomous_executor_subcommands" -- "$cur"))
            elif [[ "$subcmd" == "map" && -z "$subsubcmd" ]]; then
                COMPREPLY=($(compgen -W "$autonomous_map_subcommands" -- "$cur"))
            elif [[ "$subcmd" == "policy" && -z "$subsubcmd" ]]; then
                COMPREPLY=($(compgen -W "$autonomous_policy_subcommands" -- "$cur"))
            fi
            ;;
        peers)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$peers_subcommands" -- "$cur"))
            ;;
        incident)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$incident_subcommands" -- "$cur"))
            ;;
        faucet)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$faucet_subcommands" -- "$cur"))
            ;;
        agent)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$agent_subcommands" -- "$cur"))
            ;;
        gpu)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$gpu_subcommands" -- "$cur"))
            ;;
        model)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$model_subcommands" -- "$cur"))
            ;;
        skill)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$skill_subcommands" -- "$cur"))
            ;;
        escrow)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$escrow_subcommands" -- "$cur"))
            ;;
        reputation)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$reputation_subcommands" -- "$cur"))
            ;;
        intent)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$intent_subcommands" -- "$cur"))
            ;;
        task)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$task_subcommands" -- "$cur"))
            ;;
        governance)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$governance_subcommands" -- "$cur"))
            ;;
        messaging)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$messaging_subcommands" -- "$cur"))
            ;;
        negotiate)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$negotiate_subcommands" -- "$cur"))
            ;;
        ibc)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$ibc_subcommands" -- "$cur"))
            ;;
        query)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$query_subcommands" -- "$cur"))
            ;;
        privacy)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$privacy_subcommands" -- "$cur"))
            ;;
        staking)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$staking_subcommands" -- "$cur"))
            ;;
        completion)
            [[ -z "$subcmd" ]] && COMPREPLY=($(compgen -W "$completion_subcommands" -- "$cur"))
            ;;
    esac
}

complete -F _clawd clawd
