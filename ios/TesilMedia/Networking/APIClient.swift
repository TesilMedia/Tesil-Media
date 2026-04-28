import Foundation

/// Lightweight URLSession wrapper for the Tesil API.
///
/// Responsibilities:
///   - Build URLs from a configurable base.
///   - Inject `Authorization: Bearer <accessToken>` for endpoints that need it.
///   - On a 401 from an authed call, attempt one refresh + retry before
///     surfacing the error to the caller.
///   - Decode JSON via `JSONDecoder.api` (tolerates fractional-second dates).
@MainActor
final class APIClient {
    let baseURL: URL
    private let session: URLSession
    private weak var authStore: AuthStore?

    init(baseURL: URL? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL ?? APIClient.resolvedBaseURL()
        self.session = session
    }

    func attach(_ store: AuthStore) {
        self.authStore = store
    }

    // MARK: - Public API

    func send<Response: Decodable>(_ endpoint: Endpoint, as: Response.Type) async throws -> Response {
        let data = try await sendData(endpoint, allowRefresh: true)
        if Response.self == EmptyResponse.self {
            return EmptyResponse() as! Response
        }
        do {
            return try JSONDecoder.api.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func sendVoid(_ endpoint: Endpoint) async throws {
        _ = try await sendData(endpoint, allowRefresh: true)
    }

    // MARK: - Internal

    private func sendData(_ endpoint: Endpoint, allowRefresh: Bool) async throws -> Data {
        let request = try buildRequest(endpoint)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unexpected
        }
        if (200..<300).contains(http.statusCode) {
            return data
        }
        if http.statusCode == 401 && endpoint.requiresAuth {
            if allowRefresh, let store = authStore, await store.refreshIfPossible() {
                return try await sendData(endpoint, allowRefresh: false)
            }
            await authStore?.signOutLocally()
            throw APIError.unauthorized
        }
        throw APIError.http(status: http.statusCode, message: APIClient.messageFromBody(data))
    }

    private func buildRequest(_ endpoint: Endpoint) throws -> URLRequest {
        let pathURL = baseURL.appendingPathComponent(endpoint.path)
        var components = URLComponents(url: pathURL, resolvingAgainstBaseURL: false)
        if !endpoint.query.isEmpty {
            components?.queryItems = endpoint.query
        }
        guard let url = components?.url else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = endpoint.method.rawValue
        req.timeoutInterval = 30
        if endpoint.body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = endpoint.body
        }
        if endpoint.requiresAuth, let token = authStore?.accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private static func messageFromBody(_ data: Data) -> String? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let msg = obj["error"] as? String else {
            return nil
        }
        return msg
    }

    // MARK: - Base URL resolution

    private static func resolvedBaseURL() -> URL {
        if let env = ProcessInfo.processInfo.environment["TESIL_API_BASE_URL"],
           let url = URL(string: env) {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }
}

/// Marker response for endpoints that don't return a useful body.
struct EmptyResponse: Decodable {
    init() {}
    init(from decoder: Decoder) throws {}
}
