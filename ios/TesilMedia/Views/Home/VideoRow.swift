import SwiftUI

struct VideoRow: View {
    let video: VideoListItem

    @Environment(APIClient.self) private var api

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .bottomTrailing) {
                thumbnailView
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16/9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                if let duration = video.durationSec {
                    Text(formatDuration(duration))
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 4))
                        .foregroundStyle(.white)
                        .padding(8)
                }
            }

            HStack(alignment: .top, spacing: 10) {
                avatar
                    .frame(width: 32, height: 32)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(video.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                    Text(video.channel.name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(formatViews(video.views)) views")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var thumbnailView: some View {
        if let url = absoluteURL(video.thumbnail) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Color.gray.opacity(0.15)
                        .overlay {
                            Image(systemName: "play.rectangle")
                                .foregroundStyle(.secondary)
                        }
                }
            }
        } else {
            Color.gray.opacity(0.15)
                .overlay {
                    Image(systemName: "play.rectangle")
                        .foregroundStyle(.secondary)
                }
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if let url = absoluteURL(video.channel.avatarUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Color.gray.opacity(0.2)
                }
            }
        } else {
            Color.gray.opacity(0.2)
                .overlay {
                    Text(initials(video.channel.name))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
        }
    }

    private func absoluteURL(_ raw: String?) -> URL? {
        guard let raw, !raw.isEmpty else { return nil }
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            return URL(string: raw)
        }
        // Server returns paths like "/uploads/...". Resolve against the API base.
        return URL(string: raw, relativeTo: api.baseURL)?.absoluteURL
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}

func formatDuration(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    if h > 0 {
        return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%d:%02d", m, s)
}

func formatViews(_ count: Int) -> String {
    switch count {
    case ..<1_000:
        return "\(count)"
    case 1_000..<1_000_000:
        return String(format: "%.1fK", Double(count) / 1_000)
    default:
        return String(format: "%.1fM", Double(count) / 1_000_000)
    }
}
