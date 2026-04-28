import Foundation

struct CommentUser: Decodable, Equatable {
    let id: String
    let name: String?
    let image: String?
    let channelSlug: String?
}

struct Comment: Decodable, Identifiable, Equatable {
    let id: String
    let body: String
    let createdAt: Date
    let editedAt: Date?
    let userId: String
    let parentId: String?
    let likes: Int
    let dislikes: Int
    let userVote: Int
    let user: CommentUser
}

struct CommentListResponse: Decodable {
    let comments: [Comment]
}

struct ChatMessage: Decodable, Identifiable, Equatable {
    let id: String
    let body: String
    let createdAt: Date
    let user: CommentUser
}
