import Foundation
import Observation

/// Persisted, observable auth state. Holds the access + refresh tokens and
/// the current user, both kept in sync with the Keychain.
///
/// Lifecycle:
///   - `restore()` is called once at app start to hydrate from Keychain.
///   - `signIn` / `signUp` exchange credentials for tokens via the API.
///   - `refreshIfPossible()` is called by `APIClient` when a request 401s.
///   - `signOutLocally()` clears tokens (does not call the server — there's
///     nothing to revoke yet).
@MainActor
@Observable
final class AuthStore {
    private(set) var accessToken: String?
    private(set) var refreshToken: String?
    private(set) var currentUser: AuthUser?

    /// True once `restore()` has finished. Views should hold a splash until
    /// this flips so we don't briefly render the signed-out state for an
    /// already-signed-in user.
    private(set) var isHydrated: Bool = false

    /// Single in-flight refresh future so concurrent 401s don't trigger
    /// multiple refresh requests.
    private var refreshTask: Task<Bool, Never>?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    var isAuthenticated: Bool { accessToken != nil }

    // MARK: - Hydration

    func restore() async {
        defer { isHydrated = true }
        guard
            let access = Keychain.get(Self.accessKey),
            let refresh = Keychain.get(Self.refreshKey)
        else {
            return
        }
        self.accessToken = access
        self.refreshToken = refresh

        // Best-effort fetch of current user; if it 401s we'll refresh inside
        // APIClient, and if that fails too we'll be signed out.
        do {
            let user: AuthUser = try await apiClient.send(
                .get("/api/auth/mobile/me", requiresAuth: true),
                as: AuthUser.self
            )
            self.currentUser = user
        } catch APIError.unauthorized {
            await signOutLocally()
        } catch {
            // Network blip; keep tokens, leave currentUser nil. Views can
            // re-fetch later.
        }
    }

    // MARK: - Sign in / up

    func signIn(email: String, password: String) async throws {
        let body = LoginRequest(email: email, password: password)
        let resp: AuthResponse = try await apiClient.send(
            try .postJSON("/api/auth/mobile/login", body),
            as: AuthResponse.self
        )
        apply(resp)
    }

    func signUp(email: String, password: String, name: String?) async throws {
        let body = SignUpRequest(email: email, password: password, name: name)
        let resp: AuthResponse = try await apiClient.send(
            try .postJSON("/api/auth/mobile/signup", body),
            as: AuthResponse.self
        )
        apply(resp)
    }

    func signOutLocally() async {
        accessToken = nil
        refreshToken = nil
        currentUser = nil
        Keychain.remove(Self.accessKey)
        Keychain.remove(Self.refreshKey)
    }

    // MARK: - Refresh

    /// Returns true if we ended up with a fresh access token (either we just
    /// minted one, or another caller did before us). Returns false if we
    /// have no refresh token or the server rejected it.
    func refreshIfPossible() async -> Bool {
        if let task = refreshTask {
            return await task.value
        }
        guard let token = refreshToken else { return false }
        let task = Task<Bool, Never> { [apiClient] in
            do {
                let body = RefreshRequest(refreshToken: token)
                let resp: TokenPair = try await apiClient.send(
                    try .postJSON("/api/auth/mobile/refresh", body),
                    as: TokenPair.self
                )
                self.accessToken = resp.accessToken
                self.refreshToken = resp.refreshToken
                Keychain.set(resp.accessToken, for: Self.accessKey)
                Keychain.set(resp.refreshToken, for: Self.refreshKey)
                return true
            } catch {
                return false
            }
        }
        refreshTask = task
        let result = await task.value
        refreshTask = nil
        return result
    }

    // MARK: - Helpers

    private func apply(_ response: AuthResponse) {
        self.accessToken = response.accessToken
        self.refreshToken = response.refreshToken
        self.currentUser = response.user
        Keychain.set(response.accessToken, for: Self.accessKey)
        Keychain.set(response.refreshToken, for: Self.refreshKey)
    }

    private static let accessKey = "tesil.accessToken"
    private static let refreshKey = "tesil.refreshToken"
}

// MARK: - Wire types

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct SignUpRequest: Encodable {
    let email: String
    let password: String
    let name: String?
}

struct RefreshRequest: Encodable {
    let refreshToken: String
}

struct TokenPair: Decodable {
    let accessToken: String
    let refreshToken: String
}

struct AuthResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let accessTokenExpiresAt: Int
    let refreshTokenExpiresAt: Int
    let user: AuthUser
}
