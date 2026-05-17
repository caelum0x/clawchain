import SwiftUI

struct ChainActionsView: View {
    let onSendMessage: (String) -> Void

    @State private var shieldAmount: String = ""
    @State private var unshieldAmount: String = ""

    var body: some View {
        VStack(spacing: 12) {
            Button {
                onSendMessage("Check my ClawChain balance")
            } label: {
                Label("Check Balance", systemImage: "creditcard")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            HStack {
                TextField("Amount", text: $shieldAmount)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.numberPad)
                Button {
                    let amount = shieldAmount.isEmpty ? "1000000" : shieldAmount
                    onSendMessage("Shield \(amount) uclaw")
                    shieldAmount = ""
                } label: {
                    Label("Shield Tokens", systemImage: "lock.shield")
                }
                .buttonStyle(.bordered)
            }

            HStack {
                TextField("Amount", text: $unshieldAmount)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.numberPad)
                Button {
                    let amount = unshieldAmount.isEmpty ? "1000000" : unshieldAmount
                    onSendMessage("Unshield \(amount) uclaw")
                    unshieldAmount = ""
                } label: {
                    Label("Unshield Tokens", systemImage: "lock.open")
                }
                .buttonStyle(.bordered)
            }

            Button {
                onSendMessage("Register my agent on ClawChain")
            } label: {
                Label("Register Agent", systemImage: "person.badge.plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button {
                onSendMessage("Show my agent info")
            } label: {
                Label("View Agent Info", systemImage: "info.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}
