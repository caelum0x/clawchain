package ai.openclaw.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun ChainActionsSheet(onSendMessage: (String) -> Unit, modifier: Modifier = Modifier) {
  var shieldAmount by remember { mutableStateOf("") }
  var unshieldAmount by remember { mutableStateOf("") }

  Column(
    modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("Chain Actions", style = MaterialTheme.typography.titleMedium)

    Button(
      onClick = { onSendMessage("Check my ClawChain balance") },
      modifier = Modifier.fillMaxWidth(),
    ) {
      Icon(Icons.Default.Search, contentDescription = null)
      Spacer(Modifier.padding(start = 4.dp))
      Text("Check Balance")
    }

    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      OutlinedTextField(
        value = shieldAmount,
        onValueChange = { shieldAmount = it },
        label = { Text("Amount") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.weight(1f),
        singleLine = true,
      )
      Button(
        onClick = {
          val amount = shieldAmount.ifEmpty { "1000000" }
          onSendMessage("Shield $amount uclaw")
          shieldAmount = ""
        },
      ) {
        Icon(Icons.Default.Lock, contentDescription = null)
        Spacer(Modifier.padding(start = 4.dp))
        Text("Shield")
      }
    }

    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      OutlinedTextField(
        value = unshieldAmount,
        onValueChange = { unshieldAmount = it },
        label = { Text("Amount") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.weight(1f),
        singleLine = true,
      )
      Button(
        onClick = {
          val amount = unshieldAmount.ifEmpty { "1000000" }
          onSendMessage("Unshield $amount uclaw")
          unshieldAmount = ""
        },
      ) {
        Icon(Icons.Default.LockOpen, contentDescription = null)
        Spacer(Modifier.padding(start = 4.dp))
        Text("Unshield")
      }
    }

    Button(
      onClick = { onSendMessage("Register my agent on ClawChain") },
      modifier = Modifier.fillMaxWidth(),
    ) {
      Icon(Icons.Default.PersonAdd, contentDescription = null)
      Spacer(Modifier.padding(start = 4.dp))
      Text("Register Agent")
    }

    Button(
      onClick = { onSendMessage("Show my agent info") },
      modifier = Modifier.fillMaxWidth(),
    ) {
      Icon(Icons.Default.Info, contentDescription = null)
      Spacer(Modifier.padding(start = 4.dp))
      Text("View Agent Info")
    }

    Spacer(Modifier.height(16.dp))
  }
}
