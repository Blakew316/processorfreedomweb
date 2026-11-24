import SwiftUI
import UIKit

/// The look of the Settings lists (E9, E10), measured from the owner's photos (1125 x 2436 px of a 375 x 812 pt phone, 3 px = 1 pt).
enum SettingsListLook {
    /// #FBFBFB: the "Global settings" band (and More's profile band).
    static let band = Color(light: UIColor(hex: 0xFBFBFB), dark: .secondarySystemBackground)
    /// #E5E5E5: the 1 pt line under the band and between rows, running the full width.
    static let line = Color(light: UIColor(hex: 0xE5E5E5), dark: UIColor(hex: 0x38383A))
    /// #A6A6A9: the hairline on the row lines' lower edge, from 16 pt in.
    static let insetLine = Color(light: UIColor(hex: 0xA6A6A9), dark: UIColor(hex: 0x545458))
    /// #5C5C5C: the search field's border and placeholder, and the band's text.
    static let quiet = Color(light: UIColor(hex: 0x5C5C5C), dark: UIColor(hex: 0x9C9CA1))
}

/// Settings (E9, the owner's photo): the website's Settings cards as native lists, with a search across every row.
struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        SettingsListScreen(title: "Settings") {
            let person = model.user
            let name = (person?.name.trimmed.isEmpty == false ? person?.name.trimmed : person?.email) ?? ""
            let role = model.site?.roleName ?? ""
            SettingsRowView(title: "Profile", subtitle: [name, role].filter { !$0.isEmpty }.joined(separator: " | "), enabled: true) {
                model.shell.push(.page("profile"))
            }
            groupRow("about")
            groupRow("operations")
            groupRow("transactions")
            SettingsRowView(title: "App security and privacy", enabled: true) { model.shell.push(.appSecurity) }
            groupRow("services")
            // The app is in English only for now.
            SettingsRowView(title: "Language", enabled: false) {}
        }
        // The name on the Profile row is changed on the Profile page: it shows here when that page closes.
        .task { await SettingsActions.reloadPerson(model) }
    }

    @ViewBuilder
    private func groupRow(_ id: String) -> some View {
        if let group = SettingsCatalog.groups(owner: model.site?.isOwner == true).first(where: { $0.id == id }) {
            SettingsRowView(title: group.title, enabled: true) { model.shell.push(.settingsGroup(group.id)) }
        }
    }
}

/// A Settings sub-list (E10's layout): the page name as the title, the search field, a grey band, then the rows.
struct SettingsGroupView: View {
    let groupID: String
    @Environment(AppModel.self) private var model

    var body: some View {
        let group = SettingsCatalog.groups(owner: model.site?.isOwner == true).first { $0.id == groupID }
        SettingsListScreen(title: group?.title ?? "Settings") {
            if let group {
                ForEach(group.bands) { band in
                    // A band stays at the top of the list while its rows pass under it, as in the photos.
                    Section {
                        ForEach(band.rows) { row in
                            // The last row before another band ends on the plain line, without the darker hairline (the photos).
                            SettingsRowView(title: row.title, enabled: row.enabled,
                                            plainLine: row.id == band.rows.last?.id && band.id != group.bands.last?.id) {
                                SettingsActions.open(row, model: model)
                            }
                        }
                    } header: {
                        SettingsListBand(title: band.title)
                    }
                }
            }
        }
    }
}

/// The frame every Settings list shares (the photos): the page name bold in the middle of the bar, the "Search all settings" field
/// right under the bar, then the list, or the search results while something is typed. As in the photos of a scrolled list, the
/// field stays where it is while the rows scroll under it, and a band (a `Section` header) stays at the top of the list while its
/// rows pass.
struct SettingsListScreen<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content
    @State private var query = ""

    var body: some View {
        VStack(spacing: 0) {
            SettingsListSearchField(text: $query)
                .padding(.horizontal, 20)
                .padding(.top, 1)
                .padding(.bottom, 8)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    if query.trimmed.isEmpty {
                        content()
                    } else {
                        SettingsSearchResults(query: query.trimmed)
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color(.systemBackground))
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(title)
                    .pfFont(19, .bold, relativeTo: .headline)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .steadyNavigationBar()
    }
}

/// "Search all settings": a 48 pt field with a 1 pt grey border and 6.5 pt corners, as in the photos.
struct SettingsListSearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 17.5, weight: .regular))
                .foregroundStyle(Color.primary)
                .accessibilityHidden(true)
            TextField("Search all settings", text: $text, prompt: Text("Search all settings").foregroundStyle(SettingsListLook.quiet))
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
                // A full-size place to tap, with the mark where it was.
                .padding(.horizontal, -12)
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, 12)
        .frame(height: 48)
        .overlay(RoundedRectangle(cornerRadius: 6.5, style: .continuous).strokeBorder(SettingsListLook.quiet, lineWidth: 1))
    }
}

/// The grey band over a sub-list's rows ("Global settings", "PF Sites settings"), with a full-width line under it.
struct SettingsListBand: View {
    let title: String

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .pfFont(14.5, .medium)
                .foregroundStyle(SettingsListLook.quiet)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, minHeight: 51, alignment: .leading)
                .background(SettingsListLook.band)
                .accessibilityAddTraits(.isHeader)
            SettingsListSeparator(inset: false)
        }
    }
}

/// The line under a row: 1 pt #E5E5E5 across the whole width, with a darker hairline on its lower edge from 16 pt in.
/// Under a band it is the plain full-width line.
struct SettingsListSeparator: View {
    var inset = true
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        SettingsListLook.line
            .frame(height: 1)
            .overlay(alignment: .bottom) {
                if inset {
                    SettingsListLook.insetLine
                        .frame(height: 1 / max(displayScale, 1))
                        .padding(.leading, 16)
                }
            }
            .accessibilityHidden(true)
    }
}

/// Search across every Settings row and sub-row: a flat list, each match with its card's name in small grey type.
struct SettingsSearchResults: View {
    let query: String
    @Environment(AppModel.self) private var model

    private struct Match: Identifiable {
        let title: String
        let card: String
        let enabled: Bool
        let open: () -> Void
        var id: String { card + "/" + title }
    }

    var body: some View {
        let found = matches
        if found.isEmpty {
            Text("No settings match \u{201C}\(query)\u{201D}.")
                .pfFont(17)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 24)
                .padding(.vertical, 17)
        }
        ForEach(found) { match in
            SettingsRowView(title: match.title, subtitle: match.card, small: true, enabled: match.enabled, action: match.open)
        }
    }

    private var matches: [Match] {
        let shell = model.shell
        let groups = SettingsCatalog.groups(owner: model.site?.isOwner == true)
        var all: [Match] = [Match(title: "Profile", card: "Settings", enabled: true) { shell.push(.page("profile")) }]
        for id in ["about", "operations", "transactions"] {
            if let group = groups.first(where: { $0.id == id }) {
                all.append(Match(title: group.title, card: "Settings", enabled: true) { shell.push(.settingsGroup(group.id)) })
            }
        }
        all.append(Match(title: "App security and privacy", card: "Settings", enabled: true) { shell.push(.appSecurity) })
        if let services = groups.first(where: { $0.id == "services" }) {
            all.append(Match(title: services.title, card: "Settings", enabled: true) { shell.push(.settingsGroup(services.id)) })
        }
        all.append(Match(title: "Language", card: "Settings", enabled: false) {})
        for group in groups {
            for band in group.bands {
                for row in band.rows {
                    let model = self.model
                    all.append(Match(title: row.title, card: group.title, enabled: row.enabled) { SettingsActions.open(row, model: model) })
                }
            }
        }
        all.append(contentsOf: securityMatches)
        return all.filter { $0.title.localizedCaseInsensitiveContains(query) }
    }

    /// The rows of App security and privacy that this iPhone and this login have, as that page shows them.
    private var securityMatches: [Match] {
        let shell = model.shell
        let card = "App security and privacy"
        var out = [Match(title: "Change passcode", card: card, enabled: Keychain.device != nil) { shell.cover = .changePasscode }]
        if model.biometry != .none {
            out.append(Match(title: model.biometry.name, card: card, enabled: true) { shell.push(.appSecurity) })
        }
        out.append(Match(title: "Notifications", card: card, enabled: model.config.appPush) { shell.push(.appSecurity) })
        out.append(Match(title: "Two-step sign-in", card: card, enabled: true) { shell.push(.page("profile")) })
        out.append(Match(title: "Appearance", card: card, enabled: true) { shell.push(.appSecurity) })
        out.append(Match(title: AppSecurityView.lockTitle, card: card, enabled: true) { shell.push(.appSecurity) })
        if AppSecurityView.offersChangeLocation(model) {
            out.append(Match(title: "Change location", card: card, enabled: true) { shell.sheet = .locations })
        }
        out.append(Match(title: "Log out", card: card, enabled: true) { shell.push(.appSecurity) })
        return out
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
        case .pushed(let page): model.shell.push(.settingsPage(page))
        case .unavailable: break
        }
    }

    /// The person again from the server (`GET /api/me`), for the screens that show their name or two-step sign-in: both are
    /// changed on the Profile page, the website or another phone. Nothing changes when it cannot load.
    static func reloadPerson(_ model: AppModel) async {
        guard let answer = try? await API.get("/api/me"), !Task.isCancelled, model.phase == .ready,
              let person = User(answer["user"]) else { return }
        // Only for the same person: meanwhile the app may have locked, or someone else may have signed in.
        if let current = model.user {
            guard current.id == person.id, current != person else { return }
        }
        model.user = person
        model.remember(person)
    }
}

/// One Settings row, as in the photos: the title 17.5 pt semibold 24 pt in, a chevron 30 pt from the right edge, 55.3 pt tall,
/// and the row line under it. A second line is the same size (Profile's name and role, its baseline 28 pt under the title's), or
/// small and grey (a search match's card).
/// A row for something Processor Freedom does not have yet is greyed, without a chevron, and does nothing.
struct SettingsRowView: View {
    let title: String
    var subtitle: String = ""
    var small = false
    let enabled: Bool
    /// The line under the row without its darker hairline (the last row before a band).
    var plainLine = false
    let action: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Button {
                if enabled { action() }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: small ? 4 : 7) {
                        Text(title)
                            .pfFont(17.5, .semibold)
                            .foregroundStyle(enabled ? Color.primary : SettingsLook.greyed)
                        if !subtitle.isEmpty {
                            Text(subtitle)
                                .pfFont(small ? 14 : 17.5)
                                .foregroundStyle(enabled ? (small ? Color.secondary : Color.primary) : SettingsLook.greyed)
                        }
                    }
                    .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    if enabled {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.primary)
                            .accessibilityHidden(true)
                    }
                }
                .padding(.leading, 24)
                .padding(.trailing, 30)
                .padding(.vertical, 17)
                .frame(maxWidth: .infinity, minHeight: 55.33, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!enabled)
            .accessibilityValue(enabled ? "" : "Not available yet")
            SettingsListSeparator(inset: !plainLine)
        }
    }
}
