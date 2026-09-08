import AppKit
import AuthenticationServices
import CryptoKit
import Foundation

@MainActor
final class OAuthClient: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let origin = URL(string: "https://www.tryscalar.xyz")!
    private let callback = "scalar://oauth/callback"
    private var session: ASWebAuthenticationSession?

    var resource: String { origin.appending(path: "/api/client/v1/overview").absoluteString }

    func login() async throws -> OAuthCredentials {
        let verifier = randomURLSafeBytes(count: 48)
        let state = randomURLSafeBytes(count: 24)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
        let registration: Registration = try await postJSON(
            path: "/oauth/register",
            body: RegistrationRequest(
                redirectUris: [callback],
                clientName: "Scalar for Mac",
                scope: "openid profile crm:read"
            )
        )
        var components = URLComponents(url: origin.appending(path: "/oauth/authorize"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: registration.clientId),
            URLQueryItem(name: "redirect_uri", value: callback),
            URLQueryItem(name: "scope", value: "openid profile crm:read"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "resource", value: resource),
        ]
        let callbackURL = try await authenticate(url: components.url!)
        let returned = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard returned.first(where: { $0.name == "state" })?.value == state else { throw OAuthError.invalidState }
        if let error = returned.first(where: { $0.name == "error" })?.value { throw OAuthError.server(error) }
        guard let code = returned.first(where: { $0.name == "code" })?.value else { throw OAuthError.missingCode }
        let token = try await exchange([
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "client_id": registration.clientId,
            "redirect_uri": callback,
            "resource": resource,
        ])
        return credentials(clientId: registration.clientId, token: token)
    }

    func accessToken(from saved: OAuthCredentials) async throws -> OAuthCredentials {
        if saved.expiresAt.timeIntervalSinceNow > 60 { return saved }
        let token = try await exchange([
            "grant_type": "refresh_token",
            "refresh_token": saved.refreshToken,
            "client_id": saved.clientId,
            "resource": saved.resource,
        ])
        return credentials(clientId: saved.clientId, token: token)
    }

    func revoke(_ saved: OAuthCredentials) async throws {
        var request = URLRequest(url: origin.appending(path: "/oauth/revoke"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = [
            URLQueryItem(name: "client_id", value: saved.clientId),
            URLQueryItem(name: "token", value: saved.refreshToken),
        ].percentEncodedQuery.data(using: .utf8)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw OAuthError.server("Scalar could not confirm remote token revocation. Try signing out again.")
        }
    }

    private func credentials(clientId: String, token: OAuthTokenResponse) -> OAuthCredentials {
        OAuthCredentials(
            clientId: clientId,
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(token.expiresIn)),
            resource: resource,
            scope: token.scope
        )
    }

    private func authenticate(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "scalar") { callback, error in
                if let callback { continuation.resume(returning: callback) }
                else { continuation.resume(throwing: error ?? OAuthError.missingCode) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            guard session.start() else {
                continuation.resume(throwing: OAuthError.couldNotStart)
                return
            }
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
        }
    }

    private func exchange(_ fields: [String: String]) async throws -> OAuthTokenResponse {
        var request = URLRequest(url: origin.appending(path: "/oauth/token"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = fields
            .map { URLQueryItem(name: $0.key, value: $0.value) }
            .percentEncodedQuery
            .data(using: .utf8)
        return try await send(request)
    }

    private func postJSON<T: Decodable, Body: Encodable>(path: String, body: Body) async throws -> T {
        var request = URLRequest(url: origin.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await send(request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw OAuthError.server(String(data: data, encoding: .utf8) ?? "Authentication failed")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func randomURLSafeBytes(count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes).base64URLEncodedString()
    }
}

private struct RegistrationRequest: Encodable {
    let redirectUris: [String]
    let clientName: String
    let scope: String

    enum CodingKeys: String, CodingKey {
        case redirectUris = "redirect_uris"
        case clientName = "client_name"
        case scope
    }
}

private struct Registration: Decodable {
    let clientId: String

    enum CodingKeys: String, CodingKey { case clientId = "client_id" }
}

private enum OAuthError: LocalizedError {
    case invalidState
    case missingCode
    case couldNotStart
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidState: return "Scalar rejected an invalid OAuth state."
        case .missingCode: return "Scalar did not return an authorization code."
        case .couldNotStart: return "The secure browser login could not start."
        case .server(let message): return message
        }
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private extension Array where Element == URLQueryItem {
    var percentEncodedQuery: String {
        var components = URLComponents()
        components.queryItems = self
        return components.percentEncodedQuery ?? ""
    }
}
