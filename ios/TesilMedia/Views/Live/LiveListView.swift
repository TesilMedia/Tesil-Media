import SwiftUI

struct LiveListView: View {
    @Environment(APIClient.self) private var api

    @State private var streams: [LiveStreamListItem] = []
    @State private var nextCursor: String?
    @State private var isLoading = false
    @State private var loadError: String?

    var body: some View {
        Group {
            if streams.isEmpty && !isLoading {
                ContentUnavailableView(
                    "No live streams",
                    systemImage: "antenna.radiowaves.left.and.right",
                    description: Text("Nobody is live right now. Check back soon.")
                )
            } else {
                List {
                    ForEach(streams) { stream in
                        NavigationLink(value: stream.channel.slug) {
                            LiveRow(stream: stream)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .onAppear {
                            if stream.id == streams.last?.id, nextCursor != nil {
                                Task { await loadMore() }
                            }
                        }
                    }
                    if isLoading {
                        HStack { Spacer(); ProgressView(); Spacer() }
                            .listRowSeparator(.hidden)
                    }
                    if let loadError {
                        Text(loadError).foregroundStyle(.red).font(.callout)
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Live")
        .refreshable { await reload() }
        .task { if streams.isEmpty { await reload() } }
        .navigationDestination(for: String.self) { slug in
            LiveView(channelSlug: slug)
        }
    }

    private func reload() async {
        loadError = nil
        streams = []
        nextCursor = nil
        await loadMore(initial: true)
    }

    private func loadMore(initial: Bool = false) async {
        if isLoading { return }
        if !initial && nextCursor == nil { return }
        isLoading = true
        defer { isLoading = false }

        var query: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: "24"),
            URLQueryItem(name: "liveOnly", value: "1"),
        ]
        if let cursor = nextCursor {
            query.append(URLQueryItem(name: "cursor", value: cursor))
        }
        do {
            let resp: LiveStreamListResponse = try await api.send(
                .get("/api/streams", query: query),
                as: LiveStreamListResponse.self
            )
            streams.append(contentsOf: resp.streams)
            nextCursor = resp.nextCursor
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct LiveRow: View {
    let stream: LiveStreamListItem
    @Environment(APIClient.self) private var api

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                thumbnail
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16/9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                HStack(spacing: 4) {
                    Circle().fill(.red).frame(width: 6, height: 6)
                    Text("LIVE")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 4))
                .padding(8)
            }

            HStack(alignment: .top, spacing: 10) {
                avatar
                    .frame(width: 32, height: 32)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(stream.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                    Text(stream.channel.name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(formatViews(stream.viewers)) watching")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let url = absoluteURL(stream.thumbnail) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: placeholderThumb
                }
            }
        } else {
            placeholderThumb
        }
    }

    private var placeholderThumb: some View {
        Color.gray.opacity(0.15)
            .overlay { Image(systemName: "antenna.radiowaves.left.and.right").foregroundStyle(.secondary) }
    }

    @ViewBuilder
    private var avatar: some View {
        if let url = absoluteURL(stream.channel.avatarUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Color.gray.opacity(0.2)
                }
            }
        } else {
            Color.gray.opacity(0.2)
        }
    }

    private func absoluteURL(_ raw: String?) -> URL? {
        guard let raw, !raw.isEmpty else { return nil }
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") { return URL(string: raw) }
        return URL(string: raw, relativeTo: api.baseURL)?.absoluteURL
    }
}
