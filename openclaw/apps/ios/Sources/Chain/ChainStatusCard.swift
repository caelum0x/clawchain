import SwiftUI

struct ChainStatusCard: View {
    @Environment(ChainStatusModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle()
                    .fill(model.connected ? Color.green : Color.red)
                    .frame(width: 10, height: 10)
                Text(model.connected ? "Connected" : "Disconnected")
                    .font(.headline)
                Spacer()
                if model.isLoading {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            if let address = model.address {
                HStack {
                    Text("Address")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        UIPasteboard.general.string = address
                    } label: {
                        Text(truncateAddress(address))
                            .font(.caption.monospaced())
                    }
                }
            }

            if let balance = model.balance {
                HStack {
                    Text("Balance")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(balance) uclaw")
                        .font(.caption.monospaced())
                }
            }

            if let shielded = model.shieldedBalance {
                HStack {
                    Text("Shielded")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(shielded) uclaw")
                        .font(.caption.monospaced())
                }
            }

            if let height = model.blockHeight {
                HStack {
                    Text("Block Height")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("#\(height)")
                        .font(.caption.monospaced())
                }
            }
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func truncateAddress(_ address: String) -> String {
        guard address.count > 16 else { return address }
        let prefix = address.prefix(10)
        let suffix = address.suffix(6)
        return "\(prefix)...\(suffix)"
    }
}
