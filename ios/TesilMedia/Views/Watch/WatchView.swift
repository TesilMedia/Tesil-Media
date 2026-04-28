import SwiftUI
import AVKit

struct WatchView: View {
    let videoId: String

    @Environment(APIClient.self) private var api

    @State private var detail: VideoDetail?
    @State private var loadError: String?
    @State private var player: AVPlayer?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                playerView
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16/9, contentMode: .fit)
                    .background(Color.black)

                if let detail {
                    metadata(detail)
                }

                if let loadError {
                    Text(loadError)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task(id: videoId) {
            await load()
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }

    @ViewBuilder
    private var playerView: some View {
        if let player {
            VideoPlayer(player: player)
        } else {
            Color.black.overlay {
                ProgressView().tint(.white)
            }
        }
    }

    @ViewBuilder
    private func metadata(_ video: VideoDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(video.title)
                .font(.title3.weight(.semibold))

            HStack(spacing: 12) {
                Text(video.channel.name)
                    .font(.subheadline.weight(.medium))
                Text("\(formatViews(video.views)) views")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            if let description = video.description, !description.isEmpty {
                Divider()
                Text(description)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.bottom)
    }

    private func load() async {
        loadError = nil
        do {
            let detail: VideoDetail = try await api.send(
                .get("/api/videos/\(videoId)", requiresAuth: true),
                as: VideoDetail.self
            )
            self.detail = detail
            if let url = absoluteURL(detail.sourceUrl) {
                let item = AVPlayerItem(url: url)
                let player = AVPlayer(playerItem: item)
                self.player = player
                player.play()
            }
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func absoluteURL(_ raw: String) -> URL? {
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            return URL(string: raw)
        }
        return URL(string: raw, relativeTo: api.baseURL)?.absoluteURL
    }
}
