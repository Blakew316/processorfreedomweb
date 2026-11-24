import SwiftUI

/// The bell (E7): the website's notifications page (the same "To do" list and "Recent" items as the website's bell) in a sheet.
/// Choosing an item there closes the sheet and opens that page on the current tab.
struct NotificationsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var page: OfficePage?

    var body: some View {
        NavigationStack {
            Group {
                if let page {
                    WebPageView(page: page)
                } else {
                    Color(.systemBackground)
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .onAppear {
            if page == nil, let business = model.site {
                page = OfficePage(siteID: business.id, path: Config.sitePath(business.id, "notes"), kind: .sheet)
            }
            model.markNotesSeen()
        }
        .onDisappear {
            page?.close()
            model.markNotesSeen()
        }
    }
}

/// The 15-minute warning: a glass capsule at the top with the countdown and "Stay logged in". It is shown in its own window above
/// everything (OverlayWindows), so it tells that window where it is: only the banner takes touches, the rest go to the app.
struct IdleWarningBanner: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        let left = model.idle.secondsLeft
        let time = "\(left / 60):\(String(format: "%02d", left % 60))"
        VStack {
            HStack(spacing: 12) {
                Text("For your security, you'll be logged out in \(time)")
                    .pfFont(15)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Button {
                    model.idle.stayLoggedIn()
                } label: {
                    Text("Stay logged in")
                        .pfFont(15, .semibold)
                        .foregroundStyle(Theme.blue)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .modifier(BannerBackground(reduceTransparency: reduceTransparency))
            .background {
                GeometryReader { proxy in
                    let area = proxy.frame(in: .global)
                    Color.clear
                        .onAppear { OverlayWindows.shared.setWarningArea(area) }
                        .onChange(of: area) { _, moved in OverlayWindows.shared.setWarningArea(moved) }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .accessibilityElement(children: .contain)
            Spacer()
        }
    }
}

private struct BannerBackground: ViewModifier {
    let reduceTransparency: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(Capsule().fill(Color(.secondarySystemBackground)))
        } else {
            content.glassEffect(.regular, in: .capsule)
        }
    }
}

/// When a page cannot load: a glass card over the dimmed page, with Try again. It also comes back by itself.
struct OfflineView: View {
    let failure: WebFailure
    let retry: () -> Void
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ZStack {
            Color.black.opacity(0.25)
            VStack(spacing: 12) {
                Image(systemName: failure.symbol)
                    .font(.system(size: 34))
                    .foregroundStyle(Theme.blue)
                    .accessibilityHidden(true)
                Text(failure.title)
                    .pfFont(20, .bold)
                    .multilineTextAlignment(.center)
                Text(failure.message)
                    .pfFont(15)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                // A solid button: glass cannot sit on glass.
                Button("Try again", action: retry)
                    .buttonStyle(SolidButtonStyle(radius: 22, height: 44, size: 17))
                    .frame(maxWidth: 200)
                    .padding(.top, 4)
            }
            .padding(24)
            .frame(maxWidth: 320)
            .modifier(CardBackground(reduceTransparency: reduceTransparency))
            .padding(24)
        }
    }
}

private struct CardBackground: ViewModifier {
    let reduceTransparency: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Color(.systemBackground)))
        } else {
            content.glassEffect(.regular, in: .rect(cornerRadius: 28))
        }
    }
}

/// A kitchen login (C2): only the kitchen screen, full screen, with a small glass menu to switch business or sign out.
/// The 15-minute lock does not apply here, like on the website: the kitchen screen is meant to stay on all day.
struct KitchenView: View {
    @Environment(AppModel.self) private var model
    @State private var page: OfficePage?
    @State private var confirmSignOut = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let page {
                WebPageView(page: page)
            } else {
                Color(.systemBackground)
            }
            Menu {
                if model.sites.count > 1 {
                    Button("Switch business", systemImage: "arrow.left.arrow.right") { model.shell.sheet = .locations }
                }
                Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { confirmSignOut = true }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 22, height: 22)
            }
            .menuStyle(.button)
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .accessibilityLabel("Kitchen menu")
            .padding(.trailing, 14)
            .padding(.top, 6)
        }
        .confirmationDialog("Sign out of PF Sites on this iPhone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await model.signOut() } }
        }
        .onAppear {
            if page == nil, let business = model.site {
                page = OfficePage(siteID: business.id, path: Config.sitePath(business.id, "kitchen"), kind: .kitchen)
            }
        }
    }
}

/// No business yet: the website's "create your business" page, full screen. When it lands on the new business,
/// the app carries on with the passcode step for it.
struct CreateBusinessView: View {
    @Environment(AppModel.self) private var model
    @State private var page: OfficePage?

    var body: some View {
        NavigationStack {
            Group {
                if let page {
                    WebPageView(page: page)
                } else {
                    Color(.systemBackground)
                }
            }
            .navigationTitle("Create your business")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Log out") { Task { await model.signOut() } }
                }
            }
        }
        .onAppear {
            if page == nil {
                page = OfficePage(siteID: "", path: "/app/new", kind: .create)
            }
        }
        .onDisappear {
            page?.close()
        }
    }
}
