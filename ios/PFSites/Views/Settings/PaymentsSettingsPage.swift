import SwiftUI

/// Settings → Transactions → Payments (E14, the owner's photos, top to bottom). Every value is what Processor Freedom really does;
/// nothing here can be changed from the app yet, so every pencil is greyed, and the things it does not do are greyed with true values.
struct PaymentsSettingsPage: View {
    @Environment(AppModel.self) private var model
    @State private var settings = TransactionsSettings()

    private var siteID: String { model.site?.id ?? "" }
    /// The most a single payment can be ($999,999.99, the Virtual Terminal's limit).
    private var most: String { Money.format(Money.most) }

    var body: some View {
        // The photos have no "← Settings" link on this page: the heading comes first.
        SettingsPage(title: "Payments", heading: "Payments", refresh: { await settings.load(siteID: siteID) }) {
            // 20 pt between the cards, as in the photos.
            VStack(alignment: .leading, spacing: 20) {
                cashBack
                cashDiscount
                rounding
                offlinePayments
                paymentPreferences
                paymentThreshold
                signature
                tenders
                trackReasons
            }
        }
        .settingsLoads { await settings.load(siteID: siteID) }
    }

    /// A card with its title and greyed pencil, then its settings 37 pt apart. `extraBottom` is room some photos leave under the last one.
    private func card<Rows: View>(_ title: String, extraBottom: CGFloat = 0, @ViewBuilder rows: @escaping () -> Rows) -> some View {
        SettingsCard(spacing: TxLook.headingGap) {
            TxCardHeading(title: title) { TxPencil(card: title) }
            VStack(alignment: .leading, spacing: TxLook.rowGap) {
                rows()
            }
            .padding(.bottom, TxLook.extraBottom + extraBottom)
        }
    }

    private func off(_ text: String = "Off") -> TxPill {
        TxPill(text: text, greyed: true, solid: true)
    }

    // Processor Freedom has no cash back, cash discount, rounding or offline payments.

    private var cashBack: some View {
        // The photo puts the pill 25 pt under the name's baseline and leaves 37 pt under it: the card is 198 pt tall.
        card("Cash back", extraBottom: 4) {
            TxSettingRow(label: "Cash back (on card readers)", greyed: true) { off().padding(.top, 12) }
        }
    }

    private var cashDiscount: some View {
        SettingsCard(spacing: TxLook.headingGap) {
            TxCardHeading(title: "Cash Discount") {
                Button {} label: {
                    Text("Enable")
                        .pfFont(16, .medium)
                        .foregroundStyle(SettingsLook.greyed)
                        .padding(.horizontal, 17)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(true)
                .accessibilityLabel("Enable Cash Discount")
                .accessibilityValue("Not available yet")
            }
            // "Not available yet" takes the place of the photo's "Learn more." line: the paragraph's next line, 24 pt on, with
            // 58 pt under it to the card's edge (the card is 209 pt tall).
            VStack(alignment: .leading, spacing: 5) {
                Text("Automatically offer a discount to your customers when paying with cash.")
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
                TxValue(text: "Not available yet", greyed: true)
            }
            .padding(.bottom, TxLook.extraBottom + 22)
        }
    }

    private var rounding: some View {
        SettingsCard(spacing: TxLook.headingGap) {
            TxCardHeading(title: "Rounding", note: [.text("Round transaction totals at checkout")]) { TxPencil(card: "Rounding") }
            // Processor Freedom never rounds totals.
            TxSettingRow(label: "Enable rounding", greyed: true) { off("Disabled") }
                .padding(.bottom, TxLook.extraBottom)
        }
    }

    private var offlinePayments: some View {
        card("Offline payments") {
            Text("Continue taking payments when you don't have a network connection.")
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
            TxBullet(greyed: true) {
                VStack(alignment: .leading, spacing: TxRowStyle.payments.gap) {
                    Text("PF Sites")
                        .pfFont(18, .bold)
                        .foregroundStyle(SettingsLook.greyed)
                    off()
                    Text("Payments are not taken in the app yet.")
                        .pfFont(16)
                        .foregroundStyle(SettingsLook.greyed)
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
            Text("No card devices are connected yet.")
                .pfFont(16)
                .foregroundStyle(SettingsLook.greyed)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // Payments are not taken in the app yet, so neither of these happens.
    private var paymentPreferences: some View {
        card("Payment preferences") {
            TxSettingRow(label: "Log out after completing payment on each order",
                         note: "Each time a payment is completed, the app locks and asks for the passcode again.", greyed: true) { off() }
            TxSettingRow(label: "Fast Pay with Cash", note: "Take a cash payment right after taking an order.", greyed: true) { off() }
        }
    }

    private var paymentThreshold: some View {
        card("Payment threshold") {
            TxSettingRow(label: "Payment threshold amount", value: most)
            // The photo's bullet sits about 50 pt under the amount.
            TxBullet(greyed: true) {
                TxSettingRow(label: "Manager overrides", note: "Managers can override the transaction amount up to the max payment threshold (\(most))", greyed: true) { off() }
            }
            .padding(.top, 13)
        }
    }

    private var signature: some View {
        card("Signature") {
            TxSettingRow(label: "Signature requirement", value: "Signature not required")
            if settings.loaded {
                // Customers are asked for a tip at online checkout only while the business has tips turned on (Online ordering).
                if settings.tipsOnline {
                    TxSettingRow(label: "Signature and tip location",
                                 note: "Customers add a tip when they check out online, and staff can add one on the Virtual Terminal. Signatures are not collected.",
                                 value: "Online checkout")
                } else {
                    TxSettingRow(label: "Signature and tip location",
                                 note: "Customers aren't asked for a tip at online checkout right now. Staff can add one on the Virtual Terminal. Signatures are not collected.",
                                 value: "Virtual Terminal")
                }
            } else {
                TxSettingRow(label: "Signature and tip location") {
                    TxLoading(problem: settings.problem) { Task { await settings.load(siteID: siteID) } }
                }
            }
        }
    }

    /// The ways a payment can be recorded on orders, invoices and appointments (server/app.js TENDERS, and Bank transfer on invoices).
    private var tenders: some View {
        card("Tenders") {
            TxSettingRow(label: "Default tenders") {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(["Cash", "Card", "Online payment", "Check", "Gift card", "Bank transfer (invoices)", "Other"], id: \.self) { tender in
                        TxValue(text: tender)
                    }
                }
            }
        }
    }

    private var trackReasons: some View {
        SettingsCard(spacing: TxLook.headingGap) {
            TxCardHeading(title: "Track reasons for voids, refunds and exchanges") { TxPencil(card: "Track reasons for voids, refunds and exchanges") }
            VStack(alignment: .leading, spacing: TxRowStyle.payments.gap) {
                Text("Capture the reasons why your employees voided payments or issued refunds.")
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
                TxValue(text: "Not available yet", greyed: true)
            }
            .padding(.bottom, TxLook.extraBottom)
        }
    }
}
