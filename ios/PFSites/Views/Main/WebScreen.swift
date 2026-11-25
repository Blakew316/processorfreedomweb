import SwiftUI

/// A back-office web page pushed onto a tab (from Home's tiles, More, Settings or a notification). Its title, back button and
/// page strip come from what the page reports, so sibling pages of a section are one tap away.
struct WebScreen: View {
    let tab: String
    var script: String? = nil
    /// Opened from a native page that is the way back (the Template Library): the system back button always shows and returns
    /// there, instead of a button to the website's own parent list.
    var keepsBack = false
    @Environment(AppModel.self) private var model
    @State private var page: OfficePage?

    var body: some View {
        Group {
            if let page {
                WebPageView(page: page)
                    .safeAreaBar(edge: .top) {
                        if page.pages.count > 1 {
                            PageStrip(page: page)
                        }
                    }
            } else {
                Color(.systemBackground)
            }
        }
        .navigationTitle(title)
        .navigationSubtitle((model.site?.name ?? "").uppercased())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(hasParent)
        .toolbar {
            if hasParent, let page {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        page.back()
                    } label: {
                        Label(page.parentTitle.isEmpty ? "Back" : page.parentTitle, systemImage: "chevron.backward")
                            .labelStyle(.titleAndIcon)
                    }
                }
            }
        }
        .steadyNavigationBar()
        .onAppear {
            if page == nil, let business = model.site {
                page = OfficePage(siteID: business.id, path: Config.sitePath(business.id, tab), script: script)
            }
        }
        .onDisappear {
            // The Profile page is where two-step sign-in is turned on and the password changed, and both make the server
            // forget every phone's key, this one's too, and its notification address with it. Sending the address again as
            // the page is left finds that out at once (the server says so), instead of at the next lock.
            if tab == "profile" { Task { await model.uploadPushTokenIfWanted() } }
        }
    }

    /// A page opened from a list (a category, a menu, an invoice) goes back to its list inside the page.
    private var hasParent: Bool { !keepsBack && !(page?.parent ?? "").isEmpty }

    private var title: String {
        if let page, !page.title.isEmpty { return page.title }
        return OfficeCatalog.title(for: tab)
    }
}

/// The glass page strip under the bar: one capsule per page of the section, the open one tinted blue. The tint glides to the
/// chosen page and the page cross-fades to it.
struct PageStrip: View {
    let page: OfficePage
    @Namespace private var glass
    @State private var selected = ""
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(page.pages) { link in
                            pill(link)
                                .id(link.id)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
            .scrollIndicators(.hidden)
            .onAppear {
                selected = page.tab
                proxy.scrollTo(page.tab, anchor: .center)
            }
            .onChange(of: page.tab) { _, tab in
                withAnimation(.smooth) {
                    selected = tab
                    proxy.scrollTo(tab, anchor: .center)
                }
            }
            // A capsule that was tapped but whose page could not open (offline, say) does not stay chosen: the blue capsule goes
            // back to the page that is really there.
            .onChange(of: page.failure) { _, failure in
                guard failure != nil, selected != page.tab else { return }
                withAnimation(.smooth) {
                    selected = page.tab
                    proxy.scrollTo(page.tab, anchor: .center)
                }
            }
        }
    }

    private func pill(_ link: PageLink) -> some View {
        let on = link.id == selected
        return Button {
            guard !on else { return }
            Haptics.light()
            withAnimation(.smooth) { selected = link.id }
            page.go(link.id)
        } label: {
            Text(link.label)
                .pfFont(15, on ? .semibold : .regular)
                .foregroundStyle(on ? Color.white : Color.primary)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .modifier(PillGlass(on: on, namespace: glass, id: link.id, reduceTransparency: reduceTransparency))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Liquid Glass capsules for the page strip (the chosen one tinted blue), or solid ones with Reduce Transparency.
struct PillGlass: ViewModifier {
    let on: Bool
    let namespace: Namespace.ID
    let id: String
    let reduceTransparency: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(Capsule().fill(on ? Theme.blue : Color(.secondarySystemBackground)))
        } else if on {
            content
                .glassEffect(.regular.tint(Theme.blue).interactive(), in: .capsule)
                .glassEffectID("selected", in: namespace)
        } else {
            content
                .glassEffect(.regular.interactive(), in: .capsule)
                .glassEffectID(id, in: namespace)
        }
    }
}
