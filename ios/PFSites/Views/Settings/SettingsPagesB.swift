import SwiftUI

// PLACEHOLDERS, replaced by the Settings B agent: the pages under Settings → Transactions (E13–E17).
// Nothing here may ship; each struct keeps its name and becomes the real page (it may move to its own file).

struct OrdersOptionsPage: View {
    var body: some View { SettingsPage(title: "Orders", backLink: true, heading: "Orders Options") { EmptyView() } }
}

struct OrderReceiptsPage: View {
    var body: some View { SettingsPage(title: "Order receipts", backLink: true, heading: "Order receipts") { EmptyView() } }
}

struct OrderTypesPage: View {
    var body: some View { SettingsPage(title: "Order types", backLink: true, heading: "Order types") { EmptyView() } }
}

struct PaymentsSettingsPage: View {
    var body: some View { SettingsPage(title: "Payments", backLink: true, heading: "Payments") { EmptyView() } }
}

struct PaymentReceiptsPage: View {
    var body: some View { SettingsPage(title: "Payment receipts", backLink: true, heading: "Payment receipts") { EmptyView() } }
}

struct InvoiceNumberPage: View {
    var body: some View { SettingsPage(title: "Invoice number", backLink: true, heading: "Invoice number") { EmptyView() } }
}

struct InvoicesEstimatesPage: View {
    var body: some View { SettingsPage(title: "Invoices and estimates", backLink: true, heading: "Invoices and estimates") { EmptyView() } }
}

struct ManualCardEntryPage: View {
    var body: some View { SettingsPage(title: "Manual card entry permission", backLink: true, heading: "Manual card entry permission") { EmptyView() } }
}

struct PaymentNotePage: View {
    var body: some View { SettingsPage(title: "Payment note", backLink: true, heading: "Payment note") { EmptyView() } }
}

struct QuickSalePage: View {
    var body: some View { SettingsPage(title: "Quick sale", backLink: true, heading: "Quick sale") { EmptyView() } }
}

struct CarbonCopyReceiptsPage: View {
    var body: some View { SettingsPage(title: "Carbon copy receipts", backLink: true, heading: "Carbon copy receipts") { EmptyView() } }
}

struct TapToPayPage: View {
    var body: some View { SettingsPage(title: "Tap to Pay on iPhone", backLink: true, heading: "Tap to Pay on iPhone") { EmptyView() } }
}
