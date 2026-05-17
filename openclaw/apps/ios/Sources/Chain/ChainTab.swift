import SwiftUI

struct ChainTab: View {
    @Environment(NodeAppModel.self) private var appModel
    @Environment(ChainStatusModel.self) private var chainModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ChainStatusCard()

                    ChainActionsView { message in
                        appModel.sendChatMessage(message)
                    }
                }
                .padding()
            }
            .navigationTitle("Chain")
            .refreshable {
                await chainModel.refresh()
            }
        }
    }
}
