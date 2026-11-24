import SwiftUI
import UIKit

/// Pieces shared by the Settings pages of About your business and Services and appointments (Business information, Closeout
/// settings, Appointment booking), measured from the owner's photos (1125 x 2436 px of a 375 x 812 pt phone, 3 px = 1 pt).
/// The pages themselves are in their own files.
enum SettingsA {
    /// #253338: the values on Business information (the photos' dark slate); the label colour in dark mode.
    static let value = Color(light: UIColor(hex: 0x253338), dark: .label)
}

extension SettingsA {
    /// The open business as `GET /api/sites/<id>` describes it (server/app.js `present(req, site, true)` plus `role`): its name and
    /// address, its website draft and its ordering settings. Loaded when a page appears, on pull to refresh, and when a web page
    /// opened from the page closes, so a change made on the website or another phone shows here too.
    @Observable @MainActor
    final class SiteLoader {
        private(set) var site: JSON?
        private(set) var problem = ""
        private(set) var loading = false
        @ObservationIgnored private var round = 0

        func load(_ model: AppModel) async {
            guard let business = model.site else { return }
            round += 1
            let mine = round
            loading = true
            do {
                let answer = try await API.get("/api/sites/\(business.id)")
                guard mine == round else { return }
                if answer["site"].isObject {
                    site = answer["site"]
                    problem = ""
                } else {
                    problem = "Something went wrong. Please try again."
                }
            } catch let error as APIError {
                guard mine == round else { return }
                // Signed out everywhere, or the server ended the session: the app checks, then locks. A 403 is only a message.
                if error.status == 401 { model.sessionEnded() }
                problem = error.message
            } catch {
                // Cancelled: the page went away.
            }
            if mine == round { loading = false }
        }
    }

    /// Opens back-office web pages inside a Settings page's own navigation stack (the pencils, the links) and runs `closed` when
    /// the person comes back from one, so the page can load what was changed there.
    struct WebPages: ViewModifier {
        @Binding var tab: String?
        let closed: () -> Void

        func body(content: Content) -> some View {
            content
                .navigationDestination(item: $tab) { tab in
                    WebScreen(tab: tab)
                }
                .onChange(of: tab) { old, new in
                    if old != nil && new == nil { closed() }
                }
        }
    }

    /// The first load of a page: a spinner, or what went wrong and Try again (the app's message style).
    struct LoadState: View {
        let loading: Bool
        let problem: String
        let retry: () -> Void

        var body: some View {
            VStack(spacing: 16) {
                if !problem.isEmpty && !loading {
                    Text(problem)
                        .pfFont(17)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try again", action: retry)
                        .buttonStyle(SolidButtonStyle(radius: 24, height: 48, size: 17))
                        .frame(maxWidth: 220)
                } else {
                    ProgressView()
                        .controlSize(.large)
                        .tint(Theme.blue)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
            .padding(.horizontal, 16)
        }
    }

    /// A reload that did not work while the page already shows what it loaded before: said in one quiet line above the cards.
    struct ReloadProblem: View {
        let problem: String

        var body: some View {
            if !problem.isEmpty {
                Text(problem)
                    .pfFont(15)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// The pencil or plus at the right of a card, a card's description or a row (the photos' plain line icons in a 44 pt target).
    /// Without an action it is greyed and does nothing: nothing there can be changed yet.
    struct EditButton: View {
        var symbol = "pencil"
        var size: CGFloat = 21
        let label: String
        let action: (() -> Void)?

        var body: some View {
            Button {
                action?()
            } label: {
                Image(systemName: symbol)
                    .font(.system(size: size, weight: .regular))
                    .foregroundStyle(action == nil ? SettingsLook.greyed : Color.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(action == nil)
            .accessibilityLabel(label)
            .accessibilityValue(action == nil ? "Not available yet" : "")
        }
    }

    /// Something with a button at its right, the button centred on it (a card title, a description, a row's label). As in the
    /// photos, a one-line title or label beside a button stands as tall as the button.
    struct WithButton<Content: View>: View {
        let button: EditButton
        var trailing: CGFloat = 0
        @ViewBuilder let content: () -> Content

        var body: some View {
            HStack(alignment: .center, spacing: 12) {
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
                button
                    .padding(.trailing, trailing)
            }
        }
    }

    /// A card's title: 20 pt bold, as in the photos.
    struct CardTitle: View {
        let text: String

        var body: some View {
            Text(text)
                .pfFont(20, .bold, relativeTo: .title3)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        }
    }

    /// A muted paragraph in a card (16 pt #4D4D4D, 24 pt lines), optionally with links in it.
    struct Note: View {
        let parts: [SettingsTextPart]
        var greyed = false

        var body: some View {
            SettingsLinkedText(parts: parts, color: greyed ? SettingsLook.greyed : SettingsLook.muted)
        }
    }
}
