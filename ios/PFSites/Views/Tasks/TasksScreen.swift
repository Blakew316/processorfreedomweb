import SwiftUI

/// Home → Setup tasks (the owner's Clover photo): a full-screen cover with the bare X and "Tasks" in the bar, then each task as a
/// bold title, its description and its actions, with a hairline under it.
/// - "Get ready to take payments": Begin opens the website's own Setup tasks checklist (the same steps and actions as the website).
/// - "Create a branded website": shown while the business's website is not published yet. Create opens the website builder in
///   Safari (the photo's arrow-out icon); Not now hides the task on this iPhone.
/// Measured from the photo (1125 x 2436 px of a 375 x 812 pt phone, 3 px = 1 pt): the first title's baseline 18 pt under the bar;
/// the description 25.5 pt under its title on 20 pt lines; the actions 47 pt under the description's last line; the hairline
/// 31 pt under the actions; and the next title 34 pt under the hairline.
struct TasksScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var path: [String] = []
    /// Whether the business's website is published, from GET /api/sites/<id>; nil until it has loaded.
    @State private var live: Bool? = nil
    @State private var notNow = false

    private var siteID: String { model.site?.id ?? "" }
    private var notNowKey: String { "pf.tasks.websiteNotNow.\(siteID)" }

    /// Where the person is under this cover: the tab and how deep each tab's pages go.
    private struct Underneath: Equatable {
        let tab: MainTab
        let home: Int
        let sale: Int
        let orders: Int
        let more: Int
    }

    private var underneath: Underneath {
        let shell = model.shell
        return Underneath(tab: shell.tab, home: shell.home.count, sale: shell.sale.count, orders: shell.orders.count, more: shell.more.count)
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    task(title: "Get ready to take payments",
                         text: "Add items, set default taxes, and configure other important settings.", first: true) {
                        // A second tap that lands before the checklist has slid in does not open it twice.
                        actionButton("Begin") { if path.isEmpty { path.append("tasks") } }
                    }
                    if live == false && !notNow {
                        task(title: "Create a branded website",
                             text: "Launch your business online - no domain or design skills required.", first: false) {
                            HStack(spacing: 18) {
                                actionButton("Not now") {
                                    UserDefaults.standard.set(true, forKey: notNowKey)
                                    withAnimation(.snappy) { notNow = true }
                                }
                                actionButton("Create", external: true) {
                                    UIPresenter.safari(Config.url("/app/site/\(siteID)"))
                                }
                            }
                        }
                        .transition(.opacity)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .animation(.snappy, value: live)
            }
            .background(Color(.systemBackground))
            .refreshable { await loadLive() }
            .navigationTitle("Tasks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // The photo's bare black X, its centre 28 pt from the edge, with no glass circle behind it.
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .regular))
                            .foregroundStyle(Color.primary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .offset(x: -10)
                    .accessibilityLabel("Close")
                }
                .sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .principal) {
                    Text("Tasks")
                        .pfFont(19, .bold, relativeTo: .headline)
                        .lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .steadyNavigationBar()
            .navigationDestination(for: String.self) { tab in
                WebScreen(tab: tab)
            }
        }
        .tint(Theme.blue)
        .task(id: siteID) {
            notNow = UserDefaults.standard.bool(forKey: notNowKey)
        }
        // Whether the website is published: when this opens, when the app comes back to the front, and on the way back from the
        // checklist, where it can be published.
        .settingsLoads { await loadLive() }
        .onChange(of: path) { old, new in
            if new.isEmpty && !old.isEmpty { Task { await loadLive() } }
        }
        // A step of the checklist opens its page on the tab under this cover (the website hands the choice to the app): the
        // cover closes, so the page it opened is there to see.
        .onChange(of: underneath) { _, _ in
            dismiss()
        }
    }

    /// One task: the bold title, the description, the actions, and the hairline under it, spaced as in the photo.
    private func task<Actions: View>(title: String, text: String, first: Bool, @ViewBuilder actions: () -> Actions) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .pfFont(16.5, .semibold)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(text)
                .pfFont(14.5)
                .foregroundStyle(Color.primary)
                .lineSpacing(2.7)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7.33)
            actions()
                .padding(.leading, 1)
                .padding(.top, 16)
            Rectangle()
                .fill(SettingsLook.border)
                .frame(height: 1)
                .padding(.top, 14.67)
                .accessibilityHidden(true)
        }
        .padding(.top, first ? 2.67 : 18.67)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A task's action as the photo draws it: bold words, with the small arrow-out icon when it leaves the app.
    private func actionButton(_ title: String, external: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 11.5) {
                Text(title)
                    .pfFont(16.5, .semibold)
                if external {
                    // The photo's icon is as tall as the small letters and stands on their line.
                    Image(systemName: "arrow.up.forward.square")
                        .font(.system(size: 9.5, weight: .semibold))
                        .frame(width: 10, height: 10)
                        .offset(y: 1.4)
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(Color.primary)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(external ? "Opens in Safari" : "")
    }

    /// Whether the business's website is published. A failed load leaves the website task as it was rather than guessing.
    private func loadLive() async {
        guard !siteID.isEmpty else { return }
        do {
            let answer = try await API.get("/api/sites/\(siteID)")
            guard !Task.isCancelled, answer["site"].isObject else { return }
            live = answer["site"]["live"].bool
        } catch let error as APIError {
            // Signed out everywhere, or the server ended the session: the app checks, then locks. A 403 is only a message.
            if error.status == 401 { model.sessionEnded() }
        } catch {
            // Cancelled: the screen went away.
        }
    }
}
