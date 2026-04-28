import SwiftUI

@main
struct TesilMediaApp: App {
    @State private var authStore: AuthStore
    @State private var apiClient: APIClient

    init() {
        let client = APIClient()
        let store = AuthStore(apiClient: client)
        client.attach(store)
        _apiClient = State(initialValue: client)
        _authStore = State(initialValue: store)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authStore)
                .environment(apiClient)
                .task {
                    await authStore.restore()
                }
        }
    }
}
