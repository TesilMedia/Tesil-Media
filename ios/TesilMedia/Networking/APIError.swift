import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case transport(Error)
    case decoding(Error)
    case http(status: Int, message: String?)
    case unauthorized
    case unexpected

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid request URL."
        case .transport(let err):
            return err.localizedDescription
        case .decoding:
            return "Server returned an unexpected response."
        case .http(_, let message):
            return message ?? "Request failed."
        case .unauthorized:
            return "Sign in required."
        case .unexpected:
            return "Something went wrong."
        }
    }
}
