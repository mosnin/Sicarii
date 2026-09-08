import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor).ignoresSafeArea()
            switch model.state {
            case .signedOut:
                SignInView()
            case .loading:
                ProgressView().controlSize(.large)
            case .ready(let data):
                DashboardView(data: data)
            case .failed(let message):
                FailureView(message: message)
            }
        }
    }
}

private struct SignInView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 22) {
            ScalarMark()
            Text("Scalar")
                .font(.system(size: 42, weight: .bold, design: .rounded))
            Text("The CRM your agents run")
                .font(.title3)
                .foregroundStyle(.secondary)
            Button("Sign in to Scalar") { Task { await model.signIn() } }
                .buttonStyle(ScalarPrimaryButton())
            Text("Login opens in your default browser. Scalar stores the resulting credential only in macOS Keychain.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .padding(48)
    }
}

private struct DashboardView: View {
    @EnvironmentObject private var model: AppModel
    let data: ScalarOverview

    private let columns = [GridItem(.adaptive(minimum: 155), spacing: 14)]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                ScalarMark()
                Text("Scalar").font(.system(size: 20, weight: .bold, design: .rounded))
                Spacer()
                Text(data.account.name).foregroundStyle(.secondary)
                Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.borderless).help("Refresh")
                Button("Sign out") { Task { await model.signOut() } }.buttonStyle(.borderless)
            }
            .padding(.horizontal, 28).padding(.vertical, 18)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Overview").font(.system(size: 34, weight: .bold, design: .rounded))
                        Text("Your Scalar workspace, synced live from the web.").foregroundStyle(.secondary)
                    }
                    LazyVGrid(columns: columns, spacing: 14) {
                        MetricCard(label: "Companies", value: data.overview.metrics.companies)
                        MetricCard(label: "Contacts", value: data.overview.metrics.contacts)
                        MetricCard(label: "Enriched", value: data.overview.metrics.enriched)
                        MetricCard(label: "In conversation", value: data.overview.metrics.inConversation)
                        MetricCard(label: "Radar active", value: data.overview.metrics.radarActive)
                        MetricCard(label: "Signals this week", value: data.overview.metrics.radarSignalsLast7Days)
                    }
                    HStack(spacing: 12) {
                        AttentionCard(label: "Replies", value: data.overview.needsAttention.replies)
                        AttentionCard(label: "Follow-ups due", value: data.overview.needsAttention.dueFollowups)
                        AttentionCard(label: "To enrich", value: data.overview.needsAttention.toEnrich)
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent activity").font(.title2.bold())
                        if data.overview.recentActivity.isEmpty {
                            Text("No recent activity yet.").foregroundStyle(.secondary).padding(.vertical, 24)
                        } else {
                            ForEach(data.overview.recentActivity) { item in
                                HStack(alignment: .top, spacing: 12) {
                                    Circle().fill(ScalarBrand.blue).frame(width: 8, height: 8).padding(.top, 6)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.summary).lineLimit(2)
                                        Text("\(item.actor)  ·  \(item.kind)").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if let target = item.target {
                                        Button("Open") { NSWorkspace.shared.open(target.openUrl) }.buttonStyle(.borderless)
                                    }
                                }
                                .padding(14).background(ScalarBrand.panel).clipShape(RoundedRectangle(cornerRadius: 16))
                            }
                        }
                    }
                    HStack {
                        ForEach(data.actions) { action in
                            if action.id == "open-scalar" {
                                Button(action.label) { NSWorkspace.shared.open(action.url) }
                                    .buttonStyle(ScalarPrimaryButton())
                            } else {
                                Button(action.label) { NSWorkspace.shared.open(action.url) }
                                    .buttonStyle(ScalarSecondaryButton())
                            }
                        }
                    }
                }
                .padding(30)
            }
        }
    }
}

private struct MetricCard: View {
    let label: String
    let value: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value.formatted()).font(.system(size: 30, weight: .semibold, design: .rounded))
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(18)
        .background(ScalarBrand.panel).clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

private struct AttentionCard: View {
    let label: String
    let value: Int
    var body: some View {
        HStack { Text(label); Spacer(); Text(value.formatted()).fontWeight(.semibold).foregroundStyle(ScalarBrand.blue) }
            .frame(maxWidth: .infinity).padding(16)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))
    }
}

private struct FailureView: View {
    @EnvironmentObject private var model: AppModel
    let message: String
    var body: some View {
        VStack(spacing: 16) {
            ScalarMark()
            Text("Scalar could not connect").font(.title.bold())
            Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 500)
            HStack {
                Button("Try again") { Task { await model.restore() } }.buttonStyle(ScalarPrimaryButton())
                Button("Sign out") { Task { await model.signOut() } }.buttonStyle(.bordered)
            }
        }.padding(40)
    }
}

private struct ScalarPrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.fontWeight(.semibold).padding(.horizontal, 20).padding(.vertical, 10)
            .foregroundStyle(.white).background(ScalarBrand.blue)
            .clipShape(Capsule()).opacity(configuration.isPressed ? 0.78 : 1)
    }
}

private struct ScalarSecondaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.padding(.horizontal, 18).padding(.vertical, 9)
            .overlay(Capsule().stroke(.quaternary))
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}
