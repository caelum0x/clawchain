import Foundation

enum ChainVoiceHints {
    private static let patterns: [(keywords: [String], hint: String)] = [
        (["balance", "how much"], "Chain: checking balance..."),
        (["shield"], "Chain: shielding tokens..."),
        (["unshield"], "Chain: unshielding tokens..."),
        (["transfer", "send"], "Chain: processing transfer..."),
        (["register", "register agent"], "Chain: registering agent..."),
        (["agent info", "my agent"], "Chain: fetching agent info..."),
    ]

    static func hint(for command: String) -> String? {
        let lower = command.lowercased()
        for (keywords, hint) in patterns {
            if keywords.contains(where: { lower.contains($0) }) {
                return hint
            }
        }
        return nil
    }
}
