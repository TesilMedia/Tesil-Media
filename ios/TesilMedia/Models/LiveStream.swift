import Foundation

struct LiveStreamListItem: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let thumbnail: String?
    let viewers: Int
    let isLive: Bool
    let ingestActive: Bool
    let category: String?
    let rating: String
    let streamUrl: String
    let startedAt: Date?
    let channel: ChannelSummary
}

struct LiveStreamListResponse: Decodable {
    let streams: [LiveStreamListItem]
    let nextCursor: String?
}

struct LiveStreamDetail: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let thumbnail: String?
    let viewers: Int
    let isLive: Bool
    let ingestActive: Bool
    let category: String?
    let rating: String
    let streamUrl: String
    let startedAt: Date?
    let vodVideoId: String?
    let channel: LiveChannelDetail
}

struct LiveChannelDetail: Decodable, Equatable {
    let slug: String
    let name: String
    let avatarUrl: String?
    let description: String?
    let followers: Int
}
