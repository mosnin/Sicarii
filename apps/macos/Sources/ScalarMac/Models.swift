import Foundation

struct ScalarOverview: Decodable {
    struct Account: Decodable {
        let id: String
        let name: String
        let type: String
    }

    struct Overview: Decodable {
        struct Metrics: Decodable {
            let companies: Int
            let contacts: Int
            let enriched: Int
            let inConversation: Int
            let radarActive: Int
            let radarSignalsLast7Days: Int
        }

        struct NeedsAttention: Decodable {
            let replies: Int
            let dueFollowups: Int
            let toEnrich: Int
        }

        struct Activity: Decodable, Identifiable {
            struct Target: Decodable {
                let type: String
                let id: String
                let name: String
                let openUrl: URL
            }

            let id: String
            let kind: String
            let summary: String
            let channel: String?
            let actor: String
            let occurredAt: String
            let target: Target?
        }

        let metrics: Metrics
        let needsAttention: NeedsAttention
        let recentActivity: [Activity]
    }

    struct Action: Decodable, Identifiable {
        let id: String
        let label: String
        let url: URL
    }

    let account: Account
    let overview: Overview
    let actions: [Action]
}

struct OAuthCredentials: Codable {
    let clientId: String
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
    let resource: String
    let scope: String
}

struct OAuthTokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let scope: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case scope
    }
}
