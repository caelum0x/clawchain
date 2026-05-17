package ai.openclaw.android.chain

object ChainCommandDetector {
  private val patterns = listOf(
    listOf("balance", "how much") to "Checking balance...",
    listOf("shield") to "Shielding tokens...",
    listOf("unshield") to "Unshielding tokens...",
    listOf("transfer", "send") to "Processing transfer...",
    listOf("register", "register agent") to "Registering agent...",
    listOf("agent info", "my agent") to "Fetching agent info...",
  )

  fun detect(command: String): String? {
    val lower = command.lowercase()
    for ((keywords, hint) in patterns) {
      if (keywords.any { lower.contains(it) }) {
        return hint
      }
    }
    return null
  }
}
