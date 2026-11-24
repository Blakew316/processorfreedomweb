import SwiftUI

/// Settings → About your business → Closeout settings (E12, the owner's photo). Processor Freedom closes out by hand: the Closeout
/// page files away everything recorded since the last closeout (`POST /api/sites/<id>/closeouts`), and nothing closes out by itself,
/// so the page says so and never shows a closeout time.
struct CloseoutSettingsPage: View {
    @State private var openTab: String?

    var body: some View {
        SettingsPage(title: "Closeout settings", heading: "Closeout settings", intro: [
            .text("Closeouts total a day of sales and tenders so the books can be squared and the drawer counted. "),
            .link("Open Closeout", { openTab = "close" }),
        ]) {
            // As in the photo: the title's baseline 35 pt into the card and "Closeout method" 49 pt under it.
            SettingsCard(spacing: 27) {
                SettingsA.CardTitle(text: "Method and time")
                    .padding(.top, -4)
                setting("Closeout method", value: "Manual closeout",
                        note: "You close out from the Closeout page whenever you are ready. Everything recorded since the last closeout stays in the open batch until then.")
                setting("Closeout time", value: "None", note: "There is no automatic closeout.")
                    .padding(.top, -7)
            }
            .modifier(SettingsA.WebPages(tab: $openTab) {})
        }
    }

    /// A setting as the photo shows it: the name in bold, its value in the text colour, then a muted note.
    private func setting(_ label: String, value: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .pfFont(18, .bold)
                .foregroundStyle(Color.primary)
            Text(value)
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .padding(.top, 7)
            Text(note)
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .lineSpacing(5)
                .padding(.top, 9)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
