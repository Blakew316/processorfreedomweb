import SwiftUI

/// Settings → About your business → Business information (E11, the owner's photos). The business's real details from
/// `GET /api/sites/<id>`: its name, the customer-facing details its website draft keeps (`draft.business`, written to the live site
/// too), its logo, its privacy policy page, and its language. The pencils open the website's pages where each is changed
/// (Business information, Look and feel, Policies, Profile), and the page loads again when the person comes back.
struct BusinessInformationPage: View {
    @Environment(AppModel.self) private var model
    @State private var loader = SettingsA.SiteLoader()
    @State private var openTab: String?

    var body: some View {
        let info = loader.site.map { Info($0, fallbackName: model.site?.name ?? "") }
        SettingsPage(title: "Business information", heading: "Business information",
                     intro: info.map { [SettingsTextPart.text($0.name.uppercased())] } ?? [],
                     refresh: { await loader.load(model) }) {
            VStack(alignment: .leading, spacing: 24) {
                if let info {
                    SettingsA.ReloadProblem(problem: loader.problem)
                    customerFacing(info)
                    logoCard(info)
                    privacyCard(info)
                    localeCard(info)
                } else {
                    SettingsA.LoadState(loading: loader.loading, problem: loader.problem) {
                        Task { await loader.load(model) }
                    }
                }
            }
            .padding(.top, 14)
            .modifier(SettingsA.WebPages(tab: $openTab) {
                Task { await loader.load(model) }
            })
        }
        .task { await loader.load(model) }
    }

    // MARK: What the page shows

    private struct Info {
        enum Privacy {
            case none, standard, own

            var label: String {
                switch self {
                case .none: return "None"
                case .standard: return "Standard policy"
                case .own: return "Your own policy"
                }
            }
        }

        let name: String
        let phone: String
        let email: String
        let address: [String]
        let website: String
        let logo: URL?
        let privacy: Privacy
        let locale: String

        init(_ site: JSON, fallbackName: String) {
            let draft = site["draft"]
            let siteName = site["name"].string.trimmed, brandName = draft["brand"]["name"].string.trimmed
            name = !siteName.isEmpty ? siteName : !brandName.isEmpty ? brandName : fallbackName
            let business = draft["business"]
            phone = Self.phoneText(business["phone"].string.trimmed)
            email = business["email"].string.trimmed
            // As the website lists it: the street, "City, State", the ZIP. The country is always the United States.
            let cityState = [business["city"].string.trimmed, business["state"].string.trimmed].filter { !$0.isEmpty }.joined(separator: ", ")
            let lines = [business["address1"].string.trimmed, cityState, business["zip"].string.trimmed].filter { !$0.isEmpty }
            address = lines.isEmpty ? [] : lines + ["US"]
            // The web address only once the site is published: before that there is nothing at it.
            let url = site["url"].string.trimmed
            website = site["live"].bool ? Self.host(url) : ""
            logo = Self.logoURL(draft["brand"]["logo"].string)
            // The website shows the privacy page unless it is switched off (shared/core.js normalizeSite: enabled !== false).
            let page = draft["legal"]["privacy"]
            let on = page["enabled"].exists ? page["enabled"].bool : true
            privacy = !on ? .none : page["custom"].string.trimmed.isEmpty ? .standard : .own
            locale = draft["lang"].string == "es" ? "es-US" : "en-US"
        }

        /// "(903) 561-5325" for ten US digits, else the number as it was typed.
        static func phoneText(_ typed: String) -> String {
            let digits = typed.filter { $0.isASCII && $0.isNumber }
            guard digits.count == 10 else { return typed }
            let chars = Array(digits)
            return "(\(String(chars[0..<3]))) \(String(chars[3..<6]))-\(String(chars[6..<10]))"
        }

        static func host(_ url: String) -> String {
            var text = url
            for scheme in ["https://", "http://"] where text.lowercased().hasPrefix(scheme) {
                text = String(text.dropFirst(scheme.count))
            }
            while text.hasSuffix("/") { text.removeLast() }
            return text
        }

        /// The logo's address, by the website's own rule for images (shared/core.js safeImg): an upload of ours, a demo picture,
        /// or an https address.
        static func logoURL(_ raw: String) -> URL? {
            let text = raw.trimmed
            if text.range(of: #"^/u/[\w.-]+$"#, options: .regularExpression) != nil
                || text.range(of: #"^/assets/demo/[\w-]+\.jpg$"#, options: .regularExpression) != nil {
                return Config.url(text)
            }
            if text.range(of: #"^https://[^\s"'<>]+$"#, options: [.regularExpression, .caseInsensitive]) != nil {
                return URL(string: text)
            }
            return nil
        }
    }

    // MARK: Cards

    private func customerFacing(_ info: Info) -> some View {
        SettingsCard(spacing: 0) {
            SettingsA.CardTitle(text: "Customer-facing information")
            SettingsA.Note(parts: [.text("This information appears on your website, order pages and receipts. It may or may not be the same as your billing and tax-related business information.")])
                .padding(.top, 16)
            VStack(alignment: .leading, spacing: 26) {
                row("DBA name", edit: ("Edit DBA name", { openTab = "bizinfo" })) {
                    valueText(info.name.uppercased())
                }
                row("Business phone number") {
                    valueText(info.phone.isEmpty ? "None" : info.phone)
                }
                row("Customer contact email address (optional)", edit: ("Edit customer contact email address", { openTab = "bizinfo" }), note: emailNote) {
                    valueText(info.email.isEmpty ? "None" : info.email)
                }
                row("Business address") {
                    valueText(info.address.isEmpty ? "None" : info.address.joined(separator: "\n"))
                }
                row("Website (optional)") {
                    valueText(info.website.isEmpty ? "None" : info.website)
                }
            }
            .padding(.top, 40)
            .padding(.bottom, 14)
        }
    }

    /// The account's own email is changed on Profile, by the person it belongs to: the link is the owner's to follow.
    private var emailNote: [SettingsTextPart] {
        let start = "To update the email address tied to your Processor Freedom account, update your "
        if model.site?.isOwner == true {
            return [.text(start), .link("account owner\u{2019}s email address", { openTab = "profile" }), .text(".")]
        }
        return [.text(start + "account owner\u{2019}s email address.")]
    }

    private func logoCard(_ info: Info) -> some View {
        let open: () -> Void = { openTab = "design" }
        let has = info.logo != nil
        return SettingsCard(spacing: 0) {
            SettingsA.CardTitle(text: "Logo")
            SettingsA.WithButton(button: SettingsA.EditButton(symbol: has ? "pencil" : "plus", size: has ? 25 : 20, label: has ? "Change the logo" : "Add a logo", action: open), trailing: 8) {
                SettingsA.Note(parts: [.text("Your logo appears on your website and order pages.")])
            }
            .padding(.top, 16)
            Button(action: open) {
                logoSquare(info.logo)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(has ? "Logo. Change the logo" : "Add a logo")
            .padding(.top, 42)
            .padding(.bottom, 4)
        }
    }

    /// The 120 pt square: the logo on white, or a grey square with a camera that adds one.
    private func logoSquare(_ url: URL?) -> some View {
        ZStack {
            if let url {
                Color.white
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFit()
                            .padding(6)
                    } else if phase.error != nil {
                        Image(systemName: "photo")
                            .font(.system(size: 26))
                            .foregroundStyle(SettingsLook.greyed)
                    } else {
                        ProgressView()
                    }
                }
            } else {
                SettingsLook.border
                ZStack(alignment: .topLeading) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 19, weight: .regular))
                        .padding(.top, 5)
                        .padding(.leading, 4)
                    Image(systemName: "plus")
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundStyle(SettingsA.value)
            }
        }
        .frame(width: 120, height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        .overlay {
            if url != nil {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .strokeBorder(SettingsLook.border, lineWidth: 1)
            }
        }
        .contentShape(Rectangle())
    }

    private func privacyCard(_ info: Info) -> some View {
        let on = info.privacy != .none
        return SettingsCard(spacing: 0) {
            SettingsA.CardTitle(text: "Privacy policy")
            SettingsA.WithButton(button: SettingsA.EditButton(symbol: on ? "pencil" : "plus", size: on ? 25 : 20, label: on ? "Edit privacy policy" : "Add a privacy policy", action: { openTab = "policies" }), trailing: 8) {
                SettingsA.Note(parts: [
                    .text("Learn how to stay compliant with the "),
                    .link("California Consumer Privacy Act (CCPA)", { UIPresenter.safari(Self.ccpa) }),
                    .text(" and include your own privacy policy on your website."),
                ])
            }
            .padding(.top, 24)
            valueText(info.privacy.label)
                .padding(.top, 59)
                .padding(.bottom, 14)
        }
    }

    private static let ccpa = URL(string: "https://oag.ca.gov/privacy/ccpa")!

    private func localeCard(_ info: Info) -> some View {
        SettingsCard(spacing: 0) {
            SettingsA.CardTitle(text: "Locale and currency")
            VStack(alignment: .leading, spacing: 26) {
                row("Locale") { valueText(info.locale) }
                row("Currency") { valueText("USD") }
            }
            .padding(.top, 34)
            .padding(.bottom, 14)
        }
    }

    // MARK: Rows

    /// A detail as the photos show it: the name in bold (with a pencil at its right when it can be changed), an optional muted note,
    /// then the value.
    private func row<Value: View>(_ label: String, edit: (String, () -> Void)? = nil, note: [SettingsTextPart] = [], @ViewBuilder value: () -> Value) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let edit {
                SettingsA.WithButton(button: SettingsA.EditButton(size: 25, label: edit.0, action: edit.1), trailing: 8) {
                    labelText(label)
                }
            } else {
                labelText(label)
            }
            if !note.isEmpty {
                SettingsA.Note(parts: note)
                    .padding(.top, 13)
            }
            value()
                .padding(.top, note.isEmpty ? 10 : 13)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func labelText(_ text: String) -> some View {
        Text(text)
            .pfFont(18, .bold)
            .foregroundStyle(Color.primary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func valueText(_ text: String) -> some View {
        Text(text)
            .pfFont(16)
            .foregroundStyle(SettingsA.value)
            .lineSpacing(4)
            .fixedSize(horizontal: false, vertical: true)
    }
}
