import Foundation

/// Subset of the user record returned by `/api/auth/mobile/login` and
/// `/api/auth/mobile/me`. Channel info is included so the home tab can
/// link to "your channel" without a second request.
struct AuthUser: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    var name: String?
    var image: String?
    var channelSlug: String?
    /// Only present on `/me` (login/signup omit this for now).
    var hiddenRatings: String?
    /// Present on `/me`.
    var channel: ChannelSummary?
}

/// Lightweight channel reference embedded in user / video payloads.
struct ChannelSummary: Codable, Equatable {
    let slug: String
    let name: String
    var avatarUrl: String?
}
