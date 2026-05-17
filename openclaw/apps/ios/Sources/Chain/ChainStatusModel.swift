import Foundation
import Observation
import OpenClawKit

@MainActor
@Observable
final class ChainStatusModel {
    var connected: Bool = false
    var address: String?
    var balance: String?
    var shieldedBalance: String?
    var blockHeight: Int?
    var isLoading: Bool = false

    private var pollTask: Task<Void, Never>?
    private weak var gateway: GatewayNodeSession?

    func start(gateway: GatewayNodeSession) {
        self.gateway = gateway
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
    }

    func refresh() async {
        guard let gateway else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let data = try await gateway.request(
                method: "chain.status",
                paramsJSON: nil,
                timeoutSeconds: 10
            )
            let response = try JSONDecoder().decode(ChainStatusResponse.self, from: data)
            self.connected = response.connected
            self.address = response.address
            self.balance = response.balance
            self.shieldedBalance = response.shieldedBalance
            self.blockHeight = response.blockHeight
        } catch {
            self.connected = false
        }
    }
}

struct ChainStatusResponse: Codable {
    let connected: Bool
    let address: String?
    let balance: String?
    let shieldedBalance: String?
    let blockHeight: Int?
}
