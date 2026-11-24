import SwiftUI

// Settings → Transactions → "PF Sites settings" (Clover's "Clover Go settings", E17): Payment note, Quick sale, Carbon copy receipts
// and Tap to Pay on iPhone, from the owner's photos. White pages pushed onto the tab (the system back button, the tab bar under
// them); switches are the system's, tinted blue.

/// Payment note: the Virtual Terminal always has a note field for each payment; the other choices are not available yet.
struct PaymentNotePage: View {
    @Environment(AppModel.self) private var model
    /// The height of the capitals of the 20 pt choice names (0.705 of the size), growing with the person's text size like the names.
    @ScaledMetric(relativeTo: .body) private var choiceCap: CGFloat = 14.1

    var body: some View {
        // The photo sets its text on lines as tall as the font: 18 pt lines for the 18 pt description and notes, 20 pt lines for
        // the 20 pt choices. The top leaves room for the first line's tops.
        TxPlainPage(title: "Payment note", subtitle: (model.site?.name ?? "").uppercased(), margin: 24, top: 14.5) {
            Text("The Virtual Terminal has a note field for every payment, for your records.")
                .pfFont(18)
                .foregroundStyle(SettingsLook.muted)
                .txLineHeight(18)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                Text("Enable payment note")
                    .pfFont(20, .semibold)
                    .foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                // On, and always on: the note field is part of the Virtual Terminal.
                Toggle("Enable payment note", isOn: .constant(true))
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(true)
            }
            .padding(.top, 19)
            .accessibilityElement(children: .combine)
            .accessibilityValue("On")
            // 44 pt from one choice's last line to the next choice, and 58 pt down from "Enable payment note", as in the photo.
            VStack(alignment: .leading, spacing: 24) {
                radio("Make payment note required")
                radio("Include payment note instructions", note: "Add instructions to tell employees what to enter in the payment note field.")
                radio("Include a default payment note", note: "Show the same payment note on every transaction.")
            }
            .padding(.top, 33.5)
            Text("These options are not available yet.")
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .padding(.top, 24)
        } bottom: {
            TxSaveButton(enabled: false) {}
        }
    }

    /// A choice that cannot be picked yet: an empty circle, greyed, centred on its name (from the top of the capitals to the last
    /// baseline, over one line or two, as in the photo), and the note under the name.
    private func radio(_ label: String, note: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .choiceMiddle, spacing: 19) {
                Circle()
                    .strokeBorder(SettingsLook.greyed, lineWidth: 1)
                    .frame(width: 21, height: 21)
                    .accessibilityHidden(true)
                Text(label)
                    .pfFont(20)
                    .foregroundStyle(SettingsLook.greyed)
                    .txLineHeight(20)
                    .alignmentGuide(.choiceMiddle) { d in (d[.firstTextBaseline] - choiceCap + d[.lastTextBaseline]) / 2 }
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let note {
                Text(note)
                    .pfFont(18)
                    .foregroundStyle(SettingsLook.greyed)
                    .txLineHeight(18)
                    .padding(.leading, 21 + 19)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityValue("Not selected, not available yet")
    }
}

private extension VerticalAlignment {
    /// The middle of a Payment note choice's name, where its circle is centred.
    enum ChoiceMiddle: AlignmentID {
        static func defaultValue(in context: ViewDimensions) -> CGFloat { context[VerticalAlignment.center] }
    }

    static let choiceMiddle = VerticalAlignment(ChoiceMiddle.self)
}

/// Quick sale: selling an amount instead of items. Processor Freedom has no quick-sale default; the Sale screen's Custom item sells
/// any amount.
struct QuickSalePage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        TxPlainPage(title: "Quick sale", subtitle: (model.site?.name ?? "").uppercased(), margin: 20, top: 36) {
            Text("This setting can only be changed by the owner and applies to everyone at this business.")
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .lineSpacing(1)
                .fixedSize(horizontal: false, vertical: true)
            row("Default transactions to quick sale", note: "Enter a dollar amount for sales instead of using your item list.")
                .padding(.top, 26)
            hairline.padding(.top, 26)
            row("Default transactions to no tax", note: "Start quick sales with no tax. Tax can still be added to a single sale.")
                .padding(.top, 23)
            hairline.padding(.top, 26)
            Text("Not available yet. Use Custom item on the Sale screen to sell an amount.")
                .pfFont(15)
                .foregroundStyle(SettingsLook.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 20)
        } bottom: {
            TxSaveButton(enabled: false) {}
        }
    }

    private var hairline: some View {
        Rectangle()
            .fill(Color(.systemGray5))
            .frame(height: 1)
            .accessibilityHidden(true)
    }

    private func row(_ label: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text(label)
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.greyed)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Toggle(label, isOn: .constant(false))
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(true)
            }
            Text(note)
                .pfFont(14)
                .foregroundStyle(SettingsLook.muted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue("Off, not available yet")
    }
}

/// Carbon copy receipts: where the business's copies of new orders, booking requests and the daily summary are emailed
/// (ordering.notifyEmail; when it is empty they go to the business email, or else the owner's). One address for now, and no texts.
struct CarbonCopyReceiptsPage: View {
    @Environment(AppModel.self) private var model
    @State private var settings = TransactionsSettings()
    @State private var email = ""
    @State private var saving = false
    @State private var savedNote = false
    @State private var problem = ""
    @State private var problemIsError = true
    @FocusState private var typing: Bool

    private var siteID: String { model.site?.id ?? "" }
    private var typed: String { email.trimmed }
    private var changed: Bool { settings.loaded && typed != settings.notifyEmail }
    private var valid: Bool { typed.isEmpty || (typed.count <= 200 && typed.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"#, options: .regularExpression) != nil) }

    /// Where copies go today when no order email is set: the business email, or else the owner's.
    private var fallback: String {
        if !settings.businessEmail.isEmpty { return settings.businessEmail }
        if model.site?.isOwner == true, let mine = model.user?.email, !mine.isEmpty { return mine }
        return "The owner's email address"
    }

    var body: some View {
        TxPlainPage(margin: 17, top: 12) {
            Text("Carbon copy receipts")
                .pfFont(20, .bold, relativeTo: .title2)
                .foregroundStyle(Color.primary)
                .accessibilityAddTraits(.isHeader)
            // 17.5 pt from line to line, as in the photo.
            Text("We email a copy of every new order, booking request and the daily summary to the address below.")
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .txLineHeight(17.5)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 25)
            hairline.padding(.top, 22)

            Text("Email address")
                .pfFont(18, .semibold)
                .foregroundStyle(Color.primary)
                .padding(.top, 24)
                .accessibilityAddTraits(.isHeader)
            if settings.loaded {
                field {
                    TextField(fallback, text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .focused($typing)
                        .accessibilityLabel("Email address for copies")
                }
                .padding(.top, 14)
                // Right under the field being typed in.
                if !valid {
                    Text("Enter a valid email address.")
                        .pfFont(15)
                        .foregroundStyle(Theme.error)
                        .padding(.top, 8)
                }
            } else {
                TxLoading(problem: settings.problem) { Task { await load() } }
                    .padding(.top, 14)
            }
            unavailable("Only one address for now")
            unavailable("Only one address for now")
            hairline.padding(.top, 30)

            Text("Phone number")
                .pfFont(18, .semibold)
                .foregroundStyle(SettingsLook.greyed)
                .padding(.top, 30)
                .accessibilityAddTraits(.isHeader)
            unavailable("Phone number (optional)", first: true)
            unavailable("Phone number (optional)")
            unavailable("Phone number (optional)")
            Text("Text message copies are not available yet.")
                .pfFont(15)
                .foregroundStyle(SettingsLook.muted)
                .padding(.top, 14)

            if !problem.isEmpty {
                Text(problem)
                    .pfFont(15)
                    .foregroundStyle(problemIsError ? Theme.error : SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
            }
        } bottom: {
            TxSaveButton(title: savedNote ? "Saved" : "Save", enabled: changed && valid && !saving, busy: saving) { save() }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var hairline: some View {
        Rectangle()
            .fill(Color(.systemGray5))
            .frame(height: 1)
            .accessibilityHidden(true)
    }

    /// A field drawn as Clover does: no box, a 1 pt line under it, 50 pt from one field to the next.
    private func field<Field: View>(greyed: Bool = false, @ViewBuilder _ content: () -> Field) -> some View {
        VStack(spacing: 10) {
            content()
                .pfFont(17)
                .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
                .frame(minHeight: 28)
            Rectangle()
                .fill(greyed ? SettingsLook.greyed : Color(.systemGray))
                .frame(height: 1)
        }
    }

    /// A field that cannot be used yet: disabled and greyed, with its placeholder.
    private func unavailable(_ placeholder: String, first: Bool = false) -> some View {
        field(greyed: true) {
            TextField(placeholder, text: .constant(""))
                .disabled(true)
                .accessibilityLabel(placeholder)
                .accessibilityValue("Not available yet")
        }
        .padding(.top, first ? 14 : 12)
    }

    private func load() async {
        let before = settings.notifyEmail
        let wasLoaded = settings.loaded
        await settings.load(siteID: siteID)
        // What is typed stays while it differs from what was saved; otherwise the field follows the server.
        if !wasLoaded || email.trimmed == before { email = settings.notifyEmail }
    }

    private func save() {
        let address = typed
        // The address this page last showed as saved: if the business's address is no longer that one, someone changed it
        // elsewhere since, and theirs shows instead of being replaced unseen.
        let shown = settings.notifyEmail
        typing = false
        saving = true
        problem = ""
        Task {
            let result = await settings.saveOrdering(siteID: siteID, unchanged: { $0["notifyEmail"].string.trimmed == shown }) { ordering in
                ordering["notifyEmail"] = address
            }
            saving = false
            switch result {
            case .saved:
                Haptics.success()
                email = settings.notifyEmail
                savedNote = true
                try? await Task.sleep(nanoseconds: 1_600_000_000)
                savedNote = false
            case .stale(let message):
                email = settings.notifyEmail
                problem = message
                problemIsError = false
            case .failed(let message):
                Haptics.error()
                problem = message
                problemIsError = true
            }
        }
    }
}

/// Tap to Pay on iPhone: card payments are not connected to Processor Freedom, so it cannot be turned on.
struct TapToPayPage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        TxPlainPage(title: "Tap to Pay on iPhone", subtitle: (model.site?.name ?? "").uppercased(), margin: 18, top: 24) {
            // The photo sets this paragraph 6 pt further in than the setting under it.
            Text("Tap to Pay lets you use your iPhone to accept Apple Pay and other contactless payments with no additional hardware.")
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .lineSpacing(1)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 6)
            HStack(spacing: 12) {
                Text("Tap to Pay on iPhone")
                    .pfFont(16, .semibold)
                    .foregroundStyle(SettingsLook.greyed)
                Spacer(minLength: 8)
                Toggle("Tap to Pay on iPhone", isOn: .constant(false))
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(true)
            }
            .padding(.top, 22)
            .accessibilityElement(children: .combine)
            .accessibilityValue("Off, not available yet")
            Text("Not available yet. Card payments are not connected to Processor Freedom.")
                .pfFont(15)
                .foregroundStyle(SettingsLook.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
        }
    }
}
