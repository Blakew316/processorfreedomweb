import SwiftUI

/// More (photo 3 and the owner's next photo): the website's left sidebar as a native list. The profile row, the sidebar's
/// sections (a section with several pages opens in place), Website, then a line and Settings, Help and Card Reader, then the footer.
/// Sizes are measured from the photos (1125 x 2436 px of a 375 x 812 pt phone): 50 pt rows, 20 pt line icons centred 36 pt in,
/// 16.5 pt semibold labels 64 pt in.
struct MoreView: View {
    @Environment(AppModel.self) private var model
    @State private var open: Set<String> = []
    @State private var lastOpened = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                profileRow
                ForEach(OfficeCatalog.sections(owner: model.site?.isOwner == true)) { section in
                    sectionRows(label: section.label, icon: section.icon, pages: section.pages)
                }
                websiteRows
                SettingsListLook.line
                    .frame(height: 1)
                    .padding(.top, 25)
                    .accessibilityHidden(true)
                lowerGroup
                    .padding(.top, 24)
                    .padding(.bottom, 20)
                footer
            }
        }
        .background(Color(.systemBackground))
        .tabHeader("More")
        // The name on the profile row is changed on the Profile page, the website or another phone: it shows here when that page
        // closes and when the app comes back to the front.
        .settingsLoads { await SettingsActions.reloadPerson(model) }
    }

    // MARK: Profile

    private var profileRow: some View {
        HStack(spacing: 12) {
            Button {
                openPage("profile")
            } label: {
                HStack(spacing: 16) {
                    Circle()
                        .fill(Color(light: .white, dark: .systemBackground))
                        .overlay(Circle().strokeBorder(Theme.blue, lineWidth: 1))
                        .frame(width: 40, height: 40)
                        .overlay(
                            Image(systemName: "person")
                                .font(.system(size: 17, weight: .regular))
                                .foregroundStyle(Theme.blue)
                        )
                    Text(model.firstName.isEmpty ? "Profile" : model.firstName)
                        .pfFont(16.5, .semibold)
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.firstName.isEmpty ? "Profile" : "Profile, \(model.firstName)")
            Spacer(minLength: 8)
            Button {
                model.lock()
            } label: {
                Text("Lock screen")
                    .pfFont(14.5, .semibold)
                    .foregroundStyle(Theme.blue)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 24)
        .padding(.trailing, 25)
        .frame(minHeight: 72)
        .background(SettingsListLook.band)
    }

    // MARK: Sections

    @ViewBuilder
    private func sectionRows(label: String, icon: String, pages: [PageLink]) -> some View {
        let many = pages.count > 1
        let isOpen = open.contains(label)
        Button {
            if many {
                withAnimation(.snappy) { toggle(label) }
            } else if let only = pages.first {
                openPage(only.id)
            }
        } label: {
            rowLabel(label: label, icon: icon, chevron: many, isOpen: isOpen, enabled: true)
        }
        .buttonStyle(.plain)
        .accessibilityValue(many ? (isOpen ? "Open" : "Closed") : "")
        if many && isOpen {
            ForEach(pages) { link in
                pageRow(link.label, current: lastOpened == link.id) { openPage(link.id) }
            }
        }
    }

    /// Website: the website side's pages, with "View my live site" first when the site is live.
    @ViewBuilder
    private var websiteRows: some View {
        let isOpen = open.contains("Website")
        Button {
            withAnimation(.snappy) { toggle("Website") }
        } label: {
            rowLabel(label: "Website", icon: "globe", chevron: true, isOpen: isOpen, enabled: true)
        }
        .buttonStyle(.plain)
        .accessibilityValue(isOpen ? "Open" : "Closed")
        if isOpen {
            if let business = model.site, business.live, let url = URL(string: business.url) {
                pageRow("View my live site", current: false) { UIPresenter.safari(url) }
            }
            ForEach(OfficeCatalog.websitePages) { link in
                pageRow(link.label, current: lastOpened == link.id) { openPage(link.id) }
            }
        }
    }

    private func rowLabel(label: String, icon: String, chevron: Bool, isOpen: Bool, enabled: Bool) -> some View {
        HStack(spacing: 0) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .regular))
                .frame(width: 26)
                .accessibilityHidden(true)
            Text(label)
                .pfFont(16.5, .semibold)
                .padding(.leading, 15)
            Spacer(minLength: 8)
            if chevron {
                Image(systemName: "chevron.down")
                    .font(.system(size: 12.5, weight: .medium))
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
                    .accessibilityHidden(true)
            }
        }
        .foregroundStyle(enabled ? Color.primary : SettingsLook.greyed)
        .padding(.leading, 23)
        .padding(.trailing, 27)
        .frame(minHeight: 50)
        .contentShape(Rectangle())
    }

    private func pageRow(_ label: String, current: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .pfFont(15.5)
                .foregroundStyle(current ? Theme.blue : Color.primary)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.leading, 64)
                .padding(.trailing, 27)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: Settings, Help, Card Reader

    private var lowerGroup: some View {
        VStack(spacing: 0) {
            Button {
                model.shell.more.append(.settings)
            } label: {
                rowLabel(label: "Settings", icon: "gearshape", chevron: false, isOpen: false, enabled: true)
            }
            .buttonStyle(.plain)
            Button {
                UIPresenter.safari(Config.url("/contact"))
            } label: {
                rowLabel(label: "Help", icon: "questionmark.circle", chevron: false, isOpen: false, enabled: true)
            }
            .buttonStyle(.plain)
            // Card readers are not connected to Processor Freedom yet.
            rowLabel(label: "Card Reader", icon: "wave.3.right.circle", chevron: false, isOpen: false, enabled: false)
                .accessibilityElement(children: .combine)
                .accessibilityValue("Not available yet")
        }
    }

    // MARK: Footer

    private var footer: some View {
        VStack(alignment: .leading, spacing: 0) {
            SettingsListLook.line
                .frame(height: 1)
                .accessibilityHidden(true)
            // Terms, Privacy Policy and Accessibility always share one row: with a larger text size the row steps down
            // to smaller type and gaps instead of wrapping, and as a last resort shrinks to fit.
            ViewThatFits(in: .horizontal) {
                footerRow(size: 14.5, spacing: 17)
                footerRow(size: 13, spacing: 14)
                footerRow(size: 12, spacing: 12)
                footerRow(size: 11, spacing: 10)
                    .minimumScaleFactor(0.5)
            }
            .padding(.top, 15)
            .padding(.horizontal, 24)
            Text("© \(String(Calendar.current.component(.year, from: Date()))) Processor Freedom")
                .pfFont(14.5)
                .foregroundStyle(Color.primary)
                .padding(.top, 19)
                .padding(.horizontal, 24)
                .padding(.bottom, 26)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func footerRow(size: CGFloat, spacing: CGFloat) -> some View {
        HStack(spacing: spacing) {
            footerLink("Terms", size: size) { UIPresenter.safari(Config.url("/terms")) }
            footerLink("Privacy Policy", size: size) { UIPresenter.safari(Config.url("/privacy")) }
            // There is no accessibility page for the platform yet.
            Text("Accessibility")
                .pfFont(size, .semibold)
                .foregroundStyle(SettingsLook.greyed)
                .accessibilityValue("Not available yet")
        }
        .lineLimit(1)
    }

    private func footerLink(_ title: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .pfFont(size, .semibold)
                .foregroundStyle(Theme.blue)
                // A taller place to tap than the word itself, without moving anything.
                .padding(.vertical, 13.5)
                .padding(.horizontal, 6)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -13.5)
        .padding(.horizontal, -6)
    }

    private func toggle(_ key: String) {
        if open.contains(key) {
            _ = open.remove(key)
        } else {
            _ = open.insert(key)
        }
    }

    private func openPage(_ id: String) {
        lastOpened = id
        model.shell.more.append(.page(id))
    }
}
