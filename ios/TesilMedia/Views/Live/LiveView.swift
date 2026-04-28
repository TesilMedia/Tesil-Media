import SwiftUI
import AVKit

struct LiveView: View {
    let channelSlug: String

    @Environment(APIClient.self) private var api
    @Environment(AuthStore.self) private var auth

    @State private var detail: LiveStreamDetail?
    @State private var loadError: String?
    @State private var player: AVPlayer?

    // Chat
    @State private var messages: [ChatMessage] = []
    @State private var chatInput = ""
    @State private var isSending = false
    @State private var chatError: String?
    @State private var sseTask: Task<Void, Never>?

    var body: some View {
        GeometryReader { geo in
            if geo.size.width > geo.size.height {
                // Landscape: player left, chat right
                HStack(spacing: 0) {
                    playerColumn
                    Divider()
                    chatColumn.frame(width: 300)
                }
            } else {
                // Portrait: player top, chat below
                VStack(spacing: 0) {
                    playerView
                        .frame(maxWidth: .infinity)
                        .aspectRatio(16/9, contentMode: .fit)
                        .background(Color.black)
                    Divider()
                    VStack(alignment: .leading, spacing: 0) {
                        if let detail { streamInfo(detail).padding() }
                        chatColumn
                    }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(detail?.title ?? "Live")
        .task(id: channelSlug) { await load() }
        .onDisappear { teardown() }
    }

    // MARK: - Layout columns

    private var playerColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            playerView
                .aspectRatio(16/9, contentMode: .fit)
                .background(Color.black)
            if let detail { streamInfo(detail).padding() }
            Spacer()
        }
    }

    private var chatColumn: some View {
        VStack(spacing: 0) {
            Text("Live Chat")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
                .padding(.vertical, 8)
            Divider()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(messages) { msg in
                            ChatMessageRow(message: msg)
                                .id(msg.id)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .onChange(of: messages.count) {
                    if let last = messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            Divider()
            chatInputBar
        }
    }

    @ViewBuilder
    private var playerView: some View {
        if let player {
            VideoPlayer(player: player)
        } else if loadError != nil {
            Color.black.overlay {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(.white)
                    Text(loadError ?? "").font(.caption).foregroundStyle(.white.opacity(0.7))
                }
            }
        } else {
            Color.black.overlay { ProgressView().tint(.white) }
        }
    }

    @ViewBuilder
    private func streamInfo(_ s: LiveStreamDetail) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if s.isLive {
                    Label("LIVE", systemImage: "dot.radiowaves.left.and.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(.red, in: RoundedRectangle(cornerRadius: 4))
                }
                Text("\(formatViews(s.viewers)) watching")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(s.title).font(.subheadline.weight(.semibold))
            Text(s.channel.name).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var chatInputBar: some View {
        VStack(spacing: 4) {
            if let chatError {
                Text(chatError).font(.caption2).foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
            }
            if auth.isAuthenticated {
                HStack(spacing: 8) {
                    TextField("Message…", text: $chatInput)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await sendChat() } }

                    Button("Send") { Task { await sendChat() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(chatInput.trimmingCharacters(in: .whitespaces).isEmpty || isSending)
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            } else {
                Text("Sign in to chat")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(8)
            }
        }
    }

    // MARK: - Load / teardown

    private func load() async {
        teardown()
        loadError = nil
        detail = nil
        messages = []
        player?.pause()
        player = nil

        do {
            let d: LiveStreamDetail = try await api.send(
                .get("/api/streams/\(channelSlug)"),
                as: LiveStreamDetail.self
            )
            detail = d

            if d.isLive, let url = hlsURL(d.streamUrl) {
                let p = AVPlayer(playerItem: AVPlayerItem(url: url))
                player = p
                p.play()
            }

            startSSE(slug: channelSlug)
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func startSSE(slug: String) {
        guard let url = URL(string: "/api/stream/\(slug)/chat", relativeTo: api.baseURL)?.absoluteURL
        else { return }

        sseTask = Task {
            for await event in SSEClient.stream(url: url, accessToken: auth.accessToken, as: SSEEvent.self) {
                if event.type == "message", let msg = event.asMessage() {
                    messages.append(msg)
                }
            }
        }
    }

    private func teardown() {
        sseTask?.cancel()
        sseTask = nil
        player?.pause()
        player = nil
    }

    // MARK: - Send chat

    private func sendChat() async {
        let body = chatInput.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty, !isSending else { return }
        isSending = true
        chatError = nil
        defer { isSending = false }

        struct ChatBody: Encodable { let body: String }
        do {
            try await api.sendVoid(
                try .postJSON("/api/stream/\(channelSlug)/chat", ChatBody(body: body), requiresAuth: true)
            )
            chatInput = ""
        } catch {
            chatError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func hlsURL(_ raw: String) -> URL? {
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") { return URL(string: raw) }
        return URL(string: raw, relativeTo: api.baseURL)?.absoluteURL
    }
}

// MARK: - SSE envelope

/// The chat SSE stream emits `{ type: "message", id, body, createdAt, user }`.
private struct SSEEvent: Decodable {
    let type: String
    let id: String?
    let body: String?
    let createdAt: Date?
    let user: CommentUser?

    func asMessage() -> ChatMessage? {
        guard let id, let body, let createdAt, let user else { return nil }
        return ChatMessage(id: id, body: body, createdAt: createdAt, user: user)
    }
}

// MARK: - ChatMessageRow

struct ChatMessageRow: View {
    let message: ChatMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(message.user.name ?? "Anonymous")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.blue)
                Text(message.createdAt, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Text(message.body)
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal)
        .padding(.vertical, 4)
    }
}
