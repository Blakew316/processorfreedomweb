import SwiftUI

/// Settings → Transactions → Payment receipts (E15, the owner's photos). The values describe the receipt Processor Freedom really
/// sends: the customer's order email (server/mail.js orderEmail), with the business name and order number, how and when the order is
/// collected, the delivery address or vehicle when given, the order notes, the items with their options and prices, the totals and a
/// link to the order's status page, and the business's name, address and phone at the foot. It has no logo, cashier name or
/// barcode, and nothing is printed for the customer. Receipts cannot be customised yet, so every pencil is greyed.
struct PaymentReceiptsPage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        // The photos have no "← Settings" link on this page: the heading comes first.
        SettingsPage(title: "Payment receipts", heading: "Payment Receipts", intro: [
            .text("Customers get a receipt by email for every online order, with what they ordered and the totals. You can also update your business name, address, and phone number that appears on your receipts on the "),
            .link("business information page", { model.shell.cover = .settingsPage(.businessInformation) }),
            .text("."),
        ]) {
            // 20 pt between the cards, as in the photos.
            VStack(alignment: .leading, spacing: 20) {
                card("Printing preferences") {
                    // Orders are printed one at a time from Orders; there is no receipt screen to skip.
                    row("Automatically print customer receipt after each order", greyed: true)
                    row("Skip receipt screen and start next transaction", greyed: true)
                }
                card("Logo or custom image") {
                    row("Display logo or custom image")
                }
                card("Customize receipt messages") {
                    row("Custom header text", greyed: true)
                    row("Custom footer text", greyed: true)
                    row("Allow customers to opt-in to marketing (digital receipts only)",
                        note: "Allow \(businessName) to send marketing and other promotional messages to this email address", greyed: true)
                }
                card("Additional display preferences") {
                    // The business's street address is shown at the foot of the email whenever Business information has one.
                    row("Hide Street Address")
                    row("Group items by guest")
                    row("Order Note", on: true)
                    row("Payment Note", note: "The note included with a payment on the Virtual Terminal.", greyed: true)
                    row("Cashier name")
                    row("Line items", on: true)
                    // The customer's own receipt shows only their delivery address or vehicle, when they gave one.
                    row("Customer information")
                    row("Business website")
                    row("Barcode (printed receipts only)", note: "If an item is returned, scan the barcode to find the paid order in Orders.", greyed: true)
                    row("Space at bottom of Mini receipts (printed receipts only)", note: "Adds space after the total so the whole receipt is visible on printed receipts.", greyed: true)
                }
            }
        }
    }

    /// The business name as the photo writes it in the marketing line, in capitals.
    private var businessName: String {
        let name = (model.site?.name ?? "").trimmed
        return name.isEmpty ? "your business" : name.uppercased()
    }

    private func card<Rows: View>(_ title: String, @ViewBuilder rows: @escaping () -> Rows) -> some View {
        SettingsCard(spacing: TxLook.headingGap) {
            TxCardHeading(title: title) { TxPencil(card: title) }
            VStack(alignment: .leading, spacing: TxLook.receiptRowGap) {
                rows()
            }
            .padding(.bottom, TxLook.extraBottom)
        }
    }

    /// A 15 pt semibold name, an optional note, then the On / Off pill 13 pt under them, as in the photos.
    private func row(_ label: String, note: String? = nil, on: Bool = false, greyed: Bool = false) -> some View {
        TxSettingRow(label: label, note: note, greyed: greyed, style: .receipts) {
            TxPill(on: on, greyed: greyed)
                .padding(.top, 2)
        }
    }
}
