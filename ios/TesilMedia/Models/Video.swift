import Foundation

/// Row in the `/api/videos` list response.
struct VideoListItem: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let thumbnail: String?
    let durationSec: Int?
    let views: Int
    let likes: Int
    let dislikes: Int
    let category: String?
    let rating: String
    let sourceUrl: String
    let createdAt: Date
    let channel: ChannelSummary
}

/// Wraps the paginated list response.
struct VideoListResponse: Decodable {
    let videos: [VideoListItem]
    let nextCursor: String?
}

/// Full record returned by `/api/videos/[id]` (GET).
struct VideoDetail: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String?
    let sourceUrl: String
    let qualityVariantsJson: String?
    let transcodePending: Bool
    let thumbnail: String?
    let durationSec: Int?
    let views: Int
    let likes: Int
    let dislikes: Int
    let category: String?
    let rating: String
    let createdAt: Date
    let channel: ChannelDetail
    let userVote: Int
    let isOwner: Bool
}

struct ChannelDetail: Decodable, Equatable, Hashable {
    let slug: String
    let name: String
    let avatarUrl: String?
    let followers: Int
}
