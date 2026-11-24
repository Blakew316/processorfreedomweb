import SwiftUI

// Settings → Transactions → Invoice number, Invoices and estimates (with the Template Library) and Manual card entry permission
// (E16, from the owner's photos).

/// Invoice number: Processor Freedom numbers invoices, estimates and orders itself (server/app.js: invoices and estimates share one
/// series from 1001, orders have their own from 1001). Putting your own number on a payment or order is not available yet.
struct InvoiceNumberPage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        TxPlainPage(title: "Invoice number", subtitle: (model.site?.name ?? "").uppercased(), margin: 17, top: 12) {
            Text("Processor Freedom numbers every invoice and estimate for you (INV-1001, EST-1002 and so on) and every order (#1001 and so on). The number appears on the invoice or order and on the customer's email.")
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                Text("Enable invoice #")
                    .pfFont(16, .medium)
                    .foregroundStyle(SettingsLook.greyed)
                Spacer(minLength: 8)
                Toggle("Enable invoice #", isOn: .constant(false))
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(true)
            }
            .padding(.top, 16)
            .accessibilityElement(children: .combine)
            .accessibilityValue("Off, not available yet")
            Text("Not available yet")
                .pfFont(15)
                .foregroundStyle(SettingsLook.muted)
                .padding(.top, 4)
        } bottom: {
            TxSaveButton(enabled: false) {}
        }
    }
}

/// Manual card entry: card payments and employee permissions are not connected yet, so instead of Clover's steps there is nothing
/// to change.
struct ManualCardEntryPage: View {
    var body: some View {
        // The 18 pt description runs on 18 pt lines, as in the photo; the top leaves room for its first line's tops.
        TxPlainPage(title: "Manual card entry", margin: 24, top: 38.5) {
            Text("This permission lets staff key in a card on the Virtual Terminal.")
                .pfFont(18)
                .foregroundStyle(SettingsLook.muted)
                .txLineHeight(18)
                .fixedSize(horizontal: false, vertical: true)
            Text("How to edit")
                .textCase(.uppercase)
                .pfFont(16, .semibold)
                .foregroundStyle(Color.primary)
                .padding(.top, 29)
                .accessibilityAddTraits(.isHeader)
            Text("Card payments and employee permissions are not available yet, so there is nothing to change.")
                .pfFont(17)
                .foregroundStyle(SettingsLook.greyed)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.top, 30)
        }
    }
}

/// Invoices and estimates: how an estimate becomes an invoice in Processor Freedom (server/app.js /convert: the estimate itself turns
/// into a draft invoice, due on receipt), and the Template Library.
struct InvoicesEstimatesPage: View {
    @Environment(\.dismiss) private var dismiss
    @State private var library = false

    var body: some View {
        // The photo has no "← Settings" link on this page: the heading comes first.
        SettingsPage(title: "Invoices and estimates", heading: "Invoices and estimates") {
            // 20 pt between the cards, as in the photos.
            VStack(alignment: .leading, spacing: 20) {
                conversion
                templates
                converted
            }
            .navigationDestination(isPresented: $library) {
                // The X on the library closes the whole page, as on this one.
                TemplateLibraryView(close: { dismiss() })
            }
        }
    }

    private var conversion: some View {
        SettingsCard(spacing: TxLook.headingGap) {
            TxCardHeading(title: "Estimate to invoice conversion", note: [.text("How an estimate becomes an invoice.")]) {
                TxPencil(card: "Estimate to invoice conversion", size: 17)
            }
            VStack(alignment: .leading, spacing: TxLook.rowGap) {
                TxSettingRow(label: "Conversion",
                             value: "The estimate itself becomes a draft invoice, due on receipt, when you choose Convert to invoice.", muted: true)
                TxSettingRow(label: "Automate accepted estimate to invoice conversion",
                             value: "Estimates are converted by hand. Customers can't accept an estimate online yet, so nothing is converted automatically.", muted: true)
            }
        }
    }

    /// The whole card opens the Template Library.
    private var templates: some View {
        Button { library = true } label: {
            SettingsCard {
                TxCardHeading(title: "Templates", note: [.text("Start an invoice or estimate from a template.")]) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(Color.primary)
                        .frame(width: 44, height: 44)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    private var converted: some View {
        SettingsCard(spacing: TxLook.headingGap) {
            TxCardHeading(title: "Converted estimate management") {
                TxPencil(card: "Converted estimate management", size: 17)
            }
            TxSettingRow(label: "Sync estimates and invoices",
                         note: "Converting turns the estimate into the invoice, so there is no separate estimate to keep in sync.") {
                TxValue(text: "Not available yet", greyed: true)
            }
        }
    }
}

/// The Template Library, inside the Invoices and estimates page: the two ways Processor Freedom starts an invoice or an estimate,
/// from blank. Use template opens the website's Create New Estimate or Create New Invoice page.
private struct TemplateLibraryView: View {
    let close: () -> Void

    @Environment(\.dismiss) private var back
    @State private var query = ""
    @State private var web: String?

    private struct Template: Identifiable {
        let id: String
        let name: String
        let blurb: String
        let kind: String
        let tab: String
    }

    private static let templates = [
        Template(id: "estimate", name: "Default Estimate", blurb: "Start from a blank estimate", kind: "Estimates", tab: "est-edit"),
        Template(id: "invoice", name: "Default Invoice", blurb: "Start from a blank invoice", kind: "Invoices", tab: "inv-edit"),
    ]

    private var shown: [Template] {
        let words = query.trimmed
        guard !words.isEmpty else { return Self.templates }
        return Self.templates.filter { $0.name.localizedCaseInsensitiveContains(words) || $0.blurb.localizedCaseInsensitiveContains(words) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Button { back() } label: {
                    HStack(spacing: 18) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 20, weight: .regular))
                        Text("Invoices and estimates")
                            .pfFont(17, .medium)
                    }
                    .foregroundStyle(Color.primary)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to Invoices and estimates")
                .padding(.top, 4)

                HStack(alignment: .center, spacing: 12) {
                    Text("Template Library")
                        .pfFont(24, .bold, relativeTo: .title)
                        .foregroundStyle(Color.primary)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 8)
                    // Templates cannot be managed yet.
                    Button {} label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 20, weight: .bold))
                            .rotationEffect(.degrees(90))
                            .foregroundStyle(Color.primary)
                            .frame(width: 48, height: 48)
                            .background(SettingsLook.border, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(true)
                    .opacity(0.4)
                    .accessibilityLabel("More template options")
                    .accessibilityValue("Not available yet")
                }
                .padding(.top, 30)

                Text("Pick a template to get started.")
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 7)

                Text("Templates")
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 25)

                search
                    .padding(.top, 25)

                VStack(alignment: .leading, spacing: 16) {
                    if shown.isEmpty {
                        Text("No templates match \u{201C}\(query.trimmed)\u{201D}.")
                            .pfFont(16)
                            .foregroundStyle(SettingsLook.muted)
                    }
                    ForEach(shown) { template in
                        card(template)
                    }
                }
                .padding(.top, 28)
            }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 80)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SettingsLook.page, in: UnevenRoundedRectangle(topLeadingRadius: 20, style: .continuous))
        }
        .background(Color(.systemBackground))
        .scrollEdgeEffectStyle(.hard, for: .top)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Invoices and estimates")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { close() } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Close")
            }
            ToolbarItem(placement: .principal) {
                Text("Invoices and estimates")
                    .pfFont(19, .bold, relativeTo: .headline)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .steadyNavigationBar()
        // Back from a new estimate or invoice comes straight here, not to the website's Estimates or Invoices list.
        .txWebPages($web, keepsBack: true)
    }

    /// The round-ended search field of the photo: 48 pt, a 1 pt grey border, the magnifying glass and the placeholder.
    private var search: some View {
        HStack(spacing: 14) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(Color.secondary)
                .accessibilityHidden(true)
            TextField("Search template name or description", text: $query)
                .pfFont(16)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, 18)
        .padding(.trailing, 16)
        .frame(minHeight: 48)
        .background(Color(.systemBackground), in: Capsule())
        .overlay(Capsule().strokeBorder(Color(.systemGray), lineWidth: 1))
    }

    private func card(_ template: Template) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(template.name)
                .pfFont(16, .semibold)
                .foregroundStyle(Color.primary)
            Text(template.blurb)
                .pfFont(14)
                .foregroundStyle(SettingsLook.muted)
                .padding(.top, 8)
            HStack(spacing: 8) {
                Image(systemName: "doc.text")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(Color.primary)
                    .accessibilityHidden(true)
                Text(template.kind)
                    .pfFont(14)
                    .foregroundStyle(SettingsLook.muted)
            }
            .padding(.top, 40)
            // The photo's button: 136 x 48 pt with a 17 pt semibold label, 10 pt under the Estimates line and 17 pt above the
            // card's edge (the card is 198 pt tall).
            HStack {
                Spacer(minLength: 0)
                Button { web = template.tab } label: {
                    Text("Use template")
                        .pfFont(17, .semibold)
                        .foregroundStyle(Color.primary)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 48)
                        .background(SettingsLook.border, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Use template \(template.name)")
            }
            .padding(.top, 10)
        }
        .padding(.horizontal, 14)
        .padding(.top, 20)
        .padding(.bottom, 17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color(.systemGray3), lineWidth: 1))
    }
}
