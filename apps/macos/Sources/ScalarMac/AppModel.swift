import Foundation

@MainActor
final class AppModel: ObservableObject {
    enum State {
        case signedOut
        case loading
        case ready(ScalarOverview)
        case failed(String)
    }

    @Published private(set) var state: State = .loading
    private let oauth = OAuthClient()

    init() {
        Task { await restore() }
    }

    func restore() async {
        do {
            guard let saved = try KeychainStore.load() else {
                state = .signedOut
                return
            }
            try await load(using: saved)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func signIn() async {
        state = .loading
        do {
            let credentials = try await oauth.login()
            try KeychainStore.save(credentials)
            try await load(using: credentials)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func refresh() async {
        do {
            guard let saved = try KeychainStore.load() else {
                state = .signedOut
                return
            }
            try await load(using: saved)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func signOut() async {
        do {
            if let saved = try KeychainStore.load() { try await oauth.revoke(saved) }
            try KeychainStore.delete()
            state = .signedOut
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func load(using saved: OAuthCredentials) async throws {
        state = .loading
        let credentials = try await oauth.accessToken(from: saved)
        if credentials.refreshToken != saved.refreshToken { try KeychainStore.save(credentials) }
        var request = URLRequest(url: URL(string: credentials.resource)!)
        request.setValue("Bearer \(credentials.accessToken)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.userAuthenticationRequired)
        }
        state = .ready(try JSONDecoder().decode(ScalarOverview.self, from: data))
    }
}
