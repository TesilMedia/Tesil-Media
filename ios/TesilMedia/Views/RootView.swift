import SwiftUI

struct RootView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Group {
            if !auth.isHydrated {
                ProgressView()
                    .progressViewStyle(.circular)
            } else if auth.isAuthenticated {
                MainTabView()
            } else {
                NavigationStack {
                    SignInView()
                }
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                HomeFeedView()
            }
            .tabItem {
                Label("Home", systemImage: "play.rectangle.fill")
            }

            NavigationStack {
                ProfilePlaceholderView()
            }
            .tabItem {
                Label("You", systemImage: "person.crop.circle")
            }
        }
    }
}

private struct ProfilePlaceholderView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        List {
            Section("Account") {
                if let user = auth.currentUser {
                    LabeledContent("Email", value: user.email)
                    if let name = user.name {
                        LabeledContent("Name", value: name)
                    }
                    if let slug = user.channelSlug ?? user.channel?.slug {
                        LabeledContent("Channel", value: "/c/\(slug)")
                    }
                } else {
                    Text("Loading…").foregroundStyle(.secondary)
                }
            }
            Section {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOutLocally() }
                }
            }
        }
        .navigationTitle("You")
    }
}
