import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case delete = "DELETE"
}

struct Endpoint {
    var method: HTTPMethod
    var path: String
    var query: [URLQueryItem] = []
    var body: Data? = nil
    var requiresAuth: Bool = false

    static func get(_ path: String, query: [URLQueryItem] = [], requiresAuth: Bool = false) -> Endpoint {
        Endpoint(method: .get, path: path, query: query, requiresAuth: requiresAuth)
    }

    static func postJSON<T: Encodable>(_ path: String, _ body: T, requiresAuth: Bool = false) throws -> Endpoint {
        let data = try JSONEncoder.api.encode(body)
        return Endpoint(method: .post, path: path, body: data, requiresAuth: requiresAuth)
    }
}

extension JSONEncoder {
    static let api: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .useDefaultKeys
        return e
    }()
}

extension JSONDecoder {
    static let api: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        // ISO8601 strings with optional fractional seconds — tolerate both.
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = ISO8601DateFormatter.withFractionalSeconds.date(from: str) {
                return date
            }
            if let date = ISO8601DateFormatter.standard.date(from: str) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(str)"
            )
        }
        return d
    }()
}

private extension ISO8601DateFormatter {
    static let standard: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static let withFractionalSeconds: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
