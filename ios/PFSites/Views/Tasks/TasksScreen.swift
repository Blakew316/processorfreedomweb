import SwiftUI

/// Home → Setup tasks (the owner's Clover photo): a full-screen cover with the bare X and "Tasks" in the bar, then each task as a
/// bold title, its description and its actions, with a hairline under it.
/// - "Get ready to take payments": Begin opens the website's own Setup tasks checklist (the same steps and actions as the website).
/// - "Create a branded website": shown while the business's website is not published yet. Create opens the website builder in
///   Safari (the photo's arrow-out icon); Not now hides the task on this iPhone.
struct TasksScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var path: [String] = []
    /// Whether the business's website is published, from GET /api/sites/<id>; nil until it has loaded.
    @State private var live: Bool? = nil
    @State private var notNow = false

    private var siteID: String { model.site?.id ?? "" }
    private var notNowKey: String { "pf.tasks.websiteNotNow.\(siteID)" }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    task(title: "Get ready to take payments",
                         text: "Add items, set default taxes, and configure other important settings.") {
                        actionButton("Begin") { path.append("tasks") }
                    }
                    if live == false && !notNow {
                        task(title: "Create a branded website",
                             text: "Launch your business online - no domain or design skills required.") {
                            HStack(spacing: 30) {
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
                .padding(.top, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(.systemBackground))
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
            .navigationDestination(for: String.self) { tab in
                WebScreen(tab: tab)
            }
        }
        .tint(Theme.blue)
        .task(id: siteID) {
            notNow = UserDefaults.standard.bool(forKey: notNowKey)
            await loadLive()
        }
    }

    /// One task: the bold title, the description, the actions, and the hairline under it, spaced as in the photo.
    private func task<Actions: View>(title: String, text: String, @ViewBuilder actions: () -> Actions) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .pfFont(18, .semibold)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(text)
                .pfFont(16.5)
                .foregroundStyle(Color.primary)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            actions()
                .padding(.top, 30)
            Rectangle()
                .fill(SettingsLook.border)
                .frame(height: 1)
                .padding(.top, 28)
                .accessibilityHidden(true)
        }
        .padding(.top, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A task's action as the photo draws it: bold words, with the arrow-out icon when it leaves the app.
    private func actionButton(_ title: String, external: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title)
                    .pfFont(18, .semibold)
                if external {
                    Image(systemName: "arrow.up.forward.square")
                        .font(.system(size: 15, weight: .medium))
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

    /// Whether the business's website is published. A failed load leaves the website task hidden rather than guessing.
    private func loadLive() async {
        guard !siteID.isEmpty, let answer = try? await API.get("/api/sites/\(siteID)") else { return }
        live = answer["site"]["live"].bool
    }
}
