import SwiftUI

/// Settings (E9, the owner's photo): the website's Settings cards as native lists, with a search across every row.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                BorderedSearchField(placeholder: "Search all settings", text: $query)
                    .padding(.horizontal, 17)
                    .padding(.top, 12)
                    .padding(.bottom, 8)
                if query.trimmed.isEmpty {
                    rootRows
                } else {
                    SettingsSearchResults(query: query.trimmed)
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemBackground))
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Settings")
                    .pfFont(18, .bold)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .steadyNavigationBar()
    }

    @ViewBuilder
    private var rootRows: some View {
        let person = model.user
        let name = (person?.name.trimmed.isEmpty == false ? person?.name : person?.email) ?? ""
        let role = model.site?.roleName ?? ""
        SettingsRowView(title: "Profile", subtitle: [name, role].filter { !$0.isEmpty }.joined(separator: " | "), enabled: true) {
            model.shell.push(.page("profile"))
        }
        ForEach(SettingsCatalog.groups(owner: model.site?.isOwner == true).prefix(3)) { group in
            SettingsRowView(title: group.title, enabled: true) { model.shell.push(.settingsGroup(group.id)) }
        }
        SettingsRowView(title: "App security and privacy", enabled: true) { model.shell.push(.appSecurity) }
        SettingsRowView(title: "Services and appointments", enabled: true) { model.shell.push(.settingsGroup("services")) }
        // The app is in English only for now.
        SettingsRowView(title: "Language", enabled: false) {}
    }
}

/// A Settings sub-list (E10's layout): the page name as the title, the search field, a grey band, then the rows.
struct SettingsGroupView: View {
    let groupID: String
    @Environment(AppModel.self) private var model
    @State private var query = ""

    var body: some View {
        let group = SettingsCatalog.groups(owner: model.site?.isOwner == true).first { $0.id == groupID }
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                BorderedSearchField(placeholder: "Search all settings", text: $query)
                    .padding(.horizontal, 17)
                    .padding(.vertical, 12)
                if !query.trimmed.isEmpty {
                    SettingsSearchResults(query: query.trimmed)
                } else if let group {
                    ForEach(group.bands) { band in
                        Text(band.title)
                            .pfFont(17, .semibold)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 17)
                            .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                            .background(Color(.secondarySystemBackground))
                            .accessibilityAddTraits(.isHeader)
                        ForEach(band.rows) { row in
                            SettingsRowView(title: row.title, enabled: row.enabled) { SettingsActions.open(row, model: model) }
                        }
                    }
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemBackground))
        .navigationTitle(group?.title ?? "Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(group?.title ?? "Settings")
                    .pfFont(18, .bold)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .steadyNavigationBar()
    }
}

/// Search across every Settings row: a flat list, each match with its card's name in small grey type.
struct SettingsSearchResults: View {
    let query: String
    @Environment(AppModel.self) private var model

    private struct Match: Identifiable {
        let row: SettingsRow
        let card: String
        var id: String { card + "/" + row.title }
    }

    var body: some View {
        let found = matches
        if found.isEmpty {
            Text("No settings match \u{201C}\(query)\u{201D}.")
                .pfFont(17)
                .foregroundStyle(.secondary)
                .padding(17)
        }
        ForEach(found) { match in
            SettingsRowView(title: match.row.title, subtitle: match.card, small: true, enabled: match.row.enabled) {
                SettingsActions.open(match.row, model: model)
            }
        }
    }

    private var matches: [Match] {
        var all: [Match] = [Match(row: SettingsRow(title: "Profile", target: .page("profile")), card: "Settings")]
        for group in SettingsCatalog.groups(owner: model.site?.isOwner == true) {
            for band in group.bands {
                for row in band.rows { all.append(Match(row: row, card: group.title)) }
            }
        }
        for title in SettingsCatalog.securityTitles {
            all.append(Match(row: SettingsRow(title: title, target: .appSecurity), card: "App security and privacy"))
        }
        all.append(Match(row: SettingsRow(title: "Language", target: .unavailable), card: "Settings"))
        return all.filter { $0.row.title.localizedCaseInsensitiveContains(query) }
    }
}

/// Where a Settings row goes.
@MainActor
enum SettingsActions {
    static func open(_ row: SettingsRow, model: AppModel) {
        switch row.target {
        case .page(let id): model.shell.push(.page(id))
        case .group(let id): model.shell.push(.settingsGroup(id))
        case .locations: model.shell.sheet = .locations
        case .appSecurity: model.shell.push(.appSecurity)
        case .native(let page): model.shell.cover = .settingsPage(page)
        case .unavailable: break
        }
    }
}

/// One Settings row: ~60 pt, 20 pt medium text, a chevron, and a hairline running from 17 pt to the right edge.
/// A row for something Processor Freedom does not have yet is greyed, without a chevron, and does nothing.
struct SettingsRowView: View {
    let title: String
    var subtitle: String = ""
    var small = false
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Button {
                if enabled { action() }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .pfFont(20, .medium)
                            .foregroundStyle(enabled ? Color.primary : Color(.tertiaryLabel))
                        if !subtitle.isEmpty {
                            Text(subtitle)
                                .pfFont(small ? 14 : 18)
                                .foregroundStyle(enabled ? (small ? Color.secondary : Color.primary) : Color(.tertiaryLabel))
                        }
                    }
                    .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    if enabled {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.primary)
                            .accessibilityHidden(true)
                    }
                }
                .padding(.horizontal, 17)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!enabled)
            .accessibilityValue(enabled ? "" : "Not available yet")
            Divider()
                .padding(.leading, 17)
        }
    }
}
