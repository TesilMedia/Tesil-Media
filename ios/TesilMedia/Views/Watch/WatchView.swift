import SwiftUI
import AVKit

struct WatchView: View {
    let videoId: String

    @Environment(APIClient.self) private var api
    @Environment(AuthStore.self) private var auth

    @State private var detail: VideoDetail?
    @State private var loadError: String?
    @State private var player: AVPlayer?

    // Like state
    @State private var likes: Int = 0
    @State private var dislikes: Int = 0
    @State private var userVote: Int = 0
    @State private var isVoting = false

    // Comments
    @State private var comments: [Comment] = []
    @State private var commentsLoaded = false
    @State private var newCommentBody = ""
    @State private var isPostingComment = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                playerView
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16/9, contentMode: .fit)
                    .background(Color.black)

                if let detail {
                    VStack(alignment: .leading, spacing: 16) {
                        metadataSection(detail)
                        likeBar
                        Divider()
                        commentsSection
                    }
                    .padding()
                } else if let loadError {
                    Text(loadError)
                        .foregroundStyle(.red)
                        .padding()
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task(id: videoId) { await load() }
        .onDisappear { player?.pause(); player = nil }
    }

    // MARK: - Player

    @ViewBuilder
    private var playerView: some View {
        if let player {
            VideoPlayer(player: player)
        } else {
            Color.black.overlay { ProgressView().tint(.white) }
        }
    }

    // MARK: - Metadata

    @ViewBuilder
    private func metadataSection(_ video: VideoDetail) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(video.title)
                .font(.title3.weight(.semibold))

            HStack(spacing: 8) {
                Text(video.channel.name)
                    .font(.subheadline.weight(.medium))
                Text("·")
                    .foregroundStyle(.secondary)
                Text("\(formatViews(video.views)) views")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            if let desc = video.description, !desc.isEmpty {
                Text(desc)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            }
        }
    }

    // MARK: - Like bar

    private var likeBar: some View {
        HStack(spacing: 20) {
            Button {
                Task { await vote(1) }
            } label: {
                Label("\(likes)", systemImage: userVote == 1 ? "hand.thumbsup.fill" : "hand.thumbsup")
                    .foregroundStyle(userVote == 1 ? .blue : .primary)
            }
            .disabled(isVoting || !auth.isAuthenticated)

            Button {
                Task { await vote(-1) }
            } label: {
                Label("\(dislikes)", systemImage: userVote == -1 ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                    .foregroundStyle(userVote == -1 ? .red : .primary)
            }
            .disabled(isVoting || !auth.isAuthenticated)

            Spacer()
        }
        .font(.subheadline)
    }

    // MARK: - Comments

    private var commentsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Comments")
                .font(.headline)

            if auth.isAuthenticated {
                HStack(alignment: .top, spacing: 10) {
                    TextField("Add a comment…", text: $newCommentBody, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...4)

                    Button("Post") {
                        Task { await postComment() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(newCommentBody.trimmingCharacters(in: .whitespaces).isEmpty || isPostingComment)
                }
            }

            if comments.isEmpty && commentsLoaded {
                Text("No comments yet.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            ForEach(comments) { comment in
                CommentRow(comment: comment)
                Divider()
            }
        }
    }

    // MARK: - Load

    private func load() async {
        loadError = nil
        detail = nil
        comments = []
        commentsLoaded = false
        player?.pause()
        player = nil

        do {
            async let detailFetch: VideoDetail = api.send(
                .get("/api/videos/\(videoId)", requiresAuth: true),
                as: VideoDetail.self
            )
            async let commentsFetch: CommentListResponse = api.send(
                .get("/api/videos/\(videoId)/comments"),
                as: CommentListResponse.self
            )
            let (d, c) = try await (detailFetch, commentsFetch)
            detail = d
            likes = d.likes
            dislikes = d.dislikes
            userVote = d.userVote
            comments = c.comments
            commentsLoaded = true

            if let url = absoluteURL(d.sourceUrl) {
                let p = AVPlayer(playerItem: AVPlayerItem(url: url))
                player = p
                p.play()
            }
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - Actions

    private func vote(_ value: Int) async {
        guard !isVoting else { return }
        isVoting = true
        defer { isVoting = false }

        struct VoteBody: Encodable { let value: Int }
        struct VoteResponse: Decodable { let likes: Int; let dislikes: Int; let userVote: Int }

        do {
            let resp: VoteResponse = try await api.send(
                try .postJSON("/api/videos/\(videoId)/like", VoteBody(value: value), requiresAuth: true),
                as: VoteResponse.self
            )
            likes = resp.likes
            dislikes = resp.dislikes
            userVote = resp.userVote
        } catch {}
    }

    private func postComment() async {
        let body = newCommentBody.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty else { return }
        isPostingComment = true
        defer { isPostingComment = false }

        struct CommentBody: Encodable { let body: String }
        struct CommentResponse: Decodable { let comment: Comment }

        do {
            let resp: CommentResponse = try await api.send(
                try .postJSON("/api/videos/\(videoId)/comments", CommentBody(body: body), requiresAuth: true),
                as: CommentResponse.self
            )
            comments.insert(resp.comment, at: 0)
            newCommentBody = ""
        } catch {}
    }

    private func absoluteURL(_ raw: String) -> URL? {
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") { return URL(string: raw) }
        return URL(string: raw, relativeTo: api.baseURL)?.absoluteURL
    }
}

// MARK: - CommentRow

struct CommentRow: View {
    let comment: Comment

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(comment.user.name ?? "Anonymous")
                    .font(.caption.weight(.semibold))
                Text(comment.createdAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if comment.editedAt != nil {
                    Text("(edited)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Text(comment.body)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
    }
}
