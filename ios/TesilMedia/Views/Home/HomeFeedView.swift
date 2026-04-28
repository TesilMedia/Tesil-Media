import SwiftUI

struct HomeFeedView: View {
    @Environment(APIClient.self) private var api

    @State private var videos: [VideoListItem] = []
    @State private var nextCursor: String?
    @State private var isLoading: Bool = false
    @State private var loadError: String?

    var body: some View {
        List {
            ForEach(videos) { video in
                NavigationLink(value: video.id) {
                    VideoRow(video: video)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .onAppear {
                    if video.id == videos.last?.id, nextCursor != nil {
                        Task { await loadMore() }
                    }
                }
            }

            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }

            if let loadError {
                Text(loadError)
                    .foregroundStyle(.red)
                    .font(.callout)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .navigationTitle("Home")
        .refreshable {
            await reload()
        }
        .task {
            if videos.isEmpty {
                await reload()
            }
        }
        .navigationDestination(for: String.self) { videoId in
            WatchView(videoId: videoId)
        }
    }

    private func reload() async {
        loadError = nil
        videos = []
        nextCursor = nil
        await loadMore(initial: true)
    }

    private func loadMore(initial: Bool = false) async {
        if isLoading { return }
        if !initial && nextCursor == nil { return }
        isLoading = true
        defer { isLoading = false }

        var query: [URLQueryItem] = [URLQueryItem(name: "limit", value: "24")]
        if let cursor = nextCursor {
            query.append(URLQueryItem(name: "cursor", value: cursor))
        }

        do {
            let response: VideoListResponse = try await api.send(
                .get("/api/videos", query: query, requiresAuth: true),
                as: VideoListResponse.self
            )
            videos.append(contentsOf: response.videos)
            nextCursor = response.nextCursor
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}
