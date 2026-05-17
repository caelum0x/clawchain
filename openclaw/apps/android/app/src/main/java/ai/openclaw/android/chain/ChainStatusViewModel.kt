package ai.openclaw.android.chain

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

data class ChainState(
  val connected: Boolean = false,
  val address: String? = null,
  val balance: String? = null,
  val shieldedBalance: String? = null,
  val blockHeight: Int? = null,
  val isLoading: Boolean = false,
)

class ChainStatusViewModel : ViewModel() {
  private val _state = MutableStateFlow(ChainState())
  val state: StateFlow<ChainState> = _state

  private var pollJob: Job? = null
  private var gatewayRequest: (suspend (method: String, paramsJson: String?) -> String)? = null

  fun start(requestFn: suspend (method: String, paramsJson: String?) -> String) {
    gatewayRequest = requestFn
    pollJob?.cancel()
    pollJob = viewModelScope.launch {
      while (true) {
        refresh()
        delay(30_000)
      }
    }
  }

  fun stop() {
    pollJob?.cancel()
    pollJob = null
  }

  suspend fun refresh() {
    val reqFn = gatewayRequest ?: return
    _state.value = _state.value.copy(isLoading = true)
    try {
      val raw = reqFn("chain.status", null)
      val json = JSONObject(raw)
      _state.value = ChainState(
        connected = json.optBoolean("connected", false),
        address = json.optString("address", null),
        balance = json.optString("balance", null),
        shieldedBalance = json.optString("shieldedBalance", null),
        blockHeight = if (json.has("blockHeight") && !json.isNull("blockHeight")) json.optInt("blockHeight") else null,
        isLoading = false,
      )
    } catch (_: Throwable) {
      _state.value = _state.value.copy(connected = false, isLoading = false)
    }
  }
}
