import Foundation

/// Reads a Server-Sent Events stream from a URL, yielding decoded values of
/// type `T` via an `AsyncStream`. Reconnects automatically on transport errors
/// with a short backoff. Stops when the caller stops iterating (task cancelled).
///
/// Usage:
/// ```swift
/// for await message in SSEClient.stream(url: url, as: ChatMessage.self) {
///     messages.append(message)
/// }
/// ```
enum SSEClient {
    static func stream<T: Decodable>(
        url: URL,
        accessToken: String? = nil,
        as type: T.Type
    ) -> AsyncStream<T> {
        AsyncStream { continuation in
            let task = Task {
                var backoff: UInt64 = 1_000_000_000 // 1 second

                while !Task.isCancelled {
                    do {
                        var request = URLRequest(url: url)
                        request.timeoutInterval = 0 // no timeout for streaming
                        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                        if let token = accessToken {
                            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                        }

                        let (bytes, response) = try await URLSession.shared.bytes(for: request)
                        guard let http = response as? HTTPURLResponse,
                              (200..<300).contains(http.statusCode) else {
                            throw URLError(.badServerResponse)
                        }

                        backoff = 1_000_000_000 // reset on success

                        for try await line in bytes.lines {
                            if Task.isCancelled { break }
                            guard line.hasPrefix("data: ") else { continue }
                            let json = line.dropFirst(6)
                            guard let data = json.data(using: .utf8),
                                  let value = try? JSONDecoder.api.decode(T.self, from: data)
                            else { continue }
                            continuation.yield(value)
                        }
                    } catch {
                        if Task.isCancelled { break }
                        // Back off before reconnecting.
                        try? await Task.sleep(nanoseconds: backoff)
                        backoff = min(backoff * 2, 30_000_000_000) // cap at 30s
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
