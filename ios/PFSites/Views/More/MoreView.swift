import SwiftUI

/// More (photo 3 and the owner's next photo): the website's left sidebar as a native list. The profile row, the sidebar's
/// sections (a section with several pages opens in place), Website, then Settings, Help and Card Reader, then the footer.
struct MoreView: View {
    @Environment(AppModel.self) private var model
    @State private var open: Set<String> = []
    @State private var lastOpened = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                profileRow
                VStack(spacing: 0) {
                    ForEach(OfficeCatalog.sections(owner: model.site?.isOwner == true)) { section in
                        sectionRows(label: section.label, icon: section.icon, pages: section.pages)
                    }
                    websiteRows
                }
                .padding(.vertical, 8)
                Divider()
                lowerGroup
                    .padding(.top, 40)
                    .padding(.bottom, 16)
                footer
            }
        }
        .background(Color(.systemBackground))
        .tabHeader("More")
    }

    // MARK: Profile

    private var profileRow: some View {
        HStack(spacing: 12) {
            Button {
                openPage("profile")
            } label: {
                HStack(spacing: 18) {
                    Circle()
                        .strokeBorder(Theme.blue, lineWidth: 2)
                        .frame(width: 41, height: 41)
                        .overlay(
                            Image(systemName: "person")
                                .font(.system(size: 19))
                                .foregroundStyle(Theme.blue)
                        )
                    Text(model.firstName.isEmpty ? "Profile" : model.firstName)
                        .pfFont(20)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Profile, \(model.firstName)")
            Spacer(minLength: 8)
            Button {
                model.lock()
            } label: {
                Text("Lock screen")
                    .pfFont(18, .semibold)
                    .foregroundStyle(Theme.blue)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 25)
        .frame(minHeight: 75)
        .background(Color(.secondarySystemBackground))
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
            sectionLabel(label: label, icon: icon, chevron: many, isOpen: isOpen, enabled: true)
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
            sectionLabel(label: "Website", icon: "globe", chevron: true, isOpen: isOpen, enabled: true)
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

    private func sectionLabel(label: String, icon: String, chevron: Bool, isOpen: Bool, enabled: Bool) -> some View {
        HStack(spacing: 0) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .frame(width: 26)
                .accessibilityHidden(true)
            Text(label)
                .pfFont(20, .medium)
                .padding(.leading, 16)
            Spacer(minLength: 8)
            if chevron {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .medium))
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
                    .accessibilityHidden(true)
            }
        }
        .foregroundStyle(enabled ? Color.primary : Color(.tertiaryLabel))
        .padding(.horizontal, 26)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }

    private func pageRow(_ label: String, current: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .pfFont(17)
                .foregroundStyle(current ? Theme.blue : Color.primary)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.leading, 68)
                .padding(.trailing, 26)
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
                sectionLabel(label: "Settings", icon: "gearshape", chevron: false, isOpen: false, enabled: true)
            }
            .buttonStyle(.plain)
            Button {
                UIPresenter.safari(Config.url("/contact"))
            } label: {
                sectionLabel(label: "Help", icon: "questionmark.circle", chevron: false, isOpen: false, enabled: true)
            }
            .buttonStyle(.plain)
            // Card readers are not connected to Processor Freedom yet.
            sectionLabel(label: "Card Reader", icon: "wave.3.right.circle", chevron: false, isOpen: false, enabled: false)
                .accessibilityElement(children: .combine)
                .accessibilityValue("Not available yet")
        }
    }

    // MARK: Footer

    private var footer: some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider()
            HStack(spacing: 18) {
                footerLink("Terms") { UIPresenter.safari(Config.url("/terms")) }
                footerLink("Privacy Policy") { UIPresenter.safari(Config.url("/privacy")) }
                // There is no accessibility page for the platform yet.
                Text("Accessibility")
                    .pfFont(18, .semibold)
                    .foregroundStyle(Color(.tertiaryLabel))
                    .accessibilityValue("Not available yet")
            }
            .padding(.top, 24)
            .padding(.horizontal, 25)
            Text("© \(String(Calendar.current.component(.year, from: Date()))) Processor Freedom")
                .pfFont(18)
                .padding(.top, 18)
                .padding(.horizontal, 25)
                .padding(.bottom, 28)
        }
    }

    private func footerLink(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .pfFont(18, .semibold)
                .foregroundStyle(Theme.blue)
        }
        .buttonStyle(.plain)
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
