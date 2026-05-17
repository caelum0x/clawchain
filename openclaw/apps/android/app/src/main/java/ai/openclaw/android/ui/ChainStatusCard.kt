package ai.openclaw.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import ai.openclaw.android.chain.ChainState

@Composable
fun ChainStatusCard(state: ChainState, modifier: Modifier = Modifier) {
  val context = LocalContext.current

  Surface(
    modifier = modifier.fillMaxWidth(),
    shape = RoundedCornerShape(12.dp),
    tonalElevation = 2.dp,
  ) {
    Column(modifier = Modifier.padding(16.dp)) {
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        Box(
          modifier =
            Modifier
              .size(10.dp)
              .clip(CircleShape)
              .background(if (state.connected) Color(0xFF4CAF50) else Color(0xFFF44336)),
        )
        Text(
          text = if (state.connected) "Connected" else "Disconnected",
          style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.weight(1f))
        if (state.isLoading) {
          CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        }
      }

      Spacer(Modifier.height(12.dp))

      state.address?.let { address ->
        StatusRow(
          label = "Address",
          value = truncateAddress(address),
          modifier = Modifier.clickable {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("address", address))
            Toast.makeText(context, "Address copied", Toast.LENGTH_SHORT).show()
          },
        )
      }

      state.balance?.let { balance ->
        StatusRow(label = "Balance", value = "$balance uclaw")
      }

      state.shieldedBalance?.let { shielded ->
        StatusRow(label = "Shielded", value = "$shielded uclaw")
      }

      state.blockHeight?.let { height ->
        StatusRow(label = "Block Height", value = "#$height")
      }
    }
  }
}

@Composable
private fun StatusRow(label: String, value: String, modifier: Modifier = Modifier) {
  Row(
    modifier = modifier.fillMaxWidth().padding(vertical = 2.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
  ) {
    Text(
      text = label,
      style = MaterialTheme.typography.bodySmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Text(
      text = value,
      style = MaterialTheme.typography.bodySmall,
      fontFamily = FontFamily.Monospace,
    )
  }
}

private fun truncateAddress(address: String): String {
  if (address.length <= 16) return address
  return "${address.take(10)}...${address.takeLast(6)}"
}
