import SwiftUI

/// Order #1042: everything about one order, and the actions of the website's order sheet (the next step, Cancel order, Record
/// payment). Refunds and printing a ticket are on the website's Orders page, one tap away under "More on the website".
struct OrderDetailView: View {
    let orders: OrdersModel
    let orderID: String

    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var snapshot: CustomerOrder?
    @State private var working = false
    @State private var problem: String?
    @State private var confirmCancel = false
    @State private var choosingTender = false
    @State private var askingGiftCode = false
    @State private var giftCode = ""
    @State private var toast: String?

    private struct PollKey: Hashable {
        let active: Bool
        let ready: Bool
    }

    /// The order as the list has it now (the timer keeps it fresh), or the last copy seen if it has left the latest 300.
    private var order: CustomerOrder? { orders.order(orderID) ?? snapshot }

    var body: some View {
        Group {
            if let order {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        summaryCard(order)
                        collectCard(order)
                        customerCard(order)
                        if !order.notes.trimmed.isEmpty { notesCard(order) }
                        itemsCard(order)
                        paymentCard(order)
                        actions(order)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 20)
                    .padding(.bottom, 40)
                }
                .refreshable { await reload() }
                .overlay(alignment: .bottom) {
                    if let toast {
                        GlassToast(text: toast)
                            .padding(.horizontal, 24)
                            .padding(.bottom, 20)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            } else {
                ProgressView().controlSize(.large).tint(Theme.blue)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SettingsLook.page)
        // What scrolls under the top bar is cut off cleanly at the bar's edge, as in the photos and on the Settings pages: nothing of
        // the page shows through the bar.
        .scrollEdgeEffectStyle(.hard, for: .top)
        .navigationTitle(order.map { "Order #\(String($0.number))" } ?? "Order")
        .navigationSubtitle((model.site?.name ?? "").uppercased())
        .navigationBarTitleDisplayMode(.inline)
        .steadyNavigationBar()
        .task(id: PollKey(active: scenePhase == .active, ready: model.phase == .ready)) {
            await poll()
        }
        .onChange(of: orders.order(orderID)) { _, fresh in
            if let fresh { snapshot = fresh }
        }
        .onAppear {
            if snapshot == nil { snapshot = orders.order(orderID) }
        }
        .alert(cancelTitle, isPresented: $confirmCancel) {
            Button("Cancel", role: .cancel) {}
            Button("Cancel order", role: .destructive) { change(to: "cancelled") }
        } message: {
            Text(cancelText)
        }
        .confirmationDialog(tenderTitle, isPresented: $choosingTender, titleVisibility: .visible) {
            ForEach(OrdersModel.tenders, id: \.self) { tender in
                Button(tender) {
                    if tender == "Gift card" {
                        giftCode = ""
                        // The code is asked for once the tender sheet has gone (two presentations cannot overlap).
                        Task {
                            try? await Task.sleep(nanoseconds: 400_000_000)
                            askingGiftCode = true
                        }
                    } else {
                        pay(tender)
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(tenderText)
        }
        .alert(giftTitle, isPresented: $askingGiftCode) {
            TextField("Gift card code", text: $giftCode)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
            Button(order.map { "Pay \(Money.format($0.due))" } ?? "Pay") {
                let code = giftCode.trimmed
                if !code.isEmpty { pay("Gift card", giftCode: code) }
            }
            // Without a code there is nothing to pay with: the button waits, instead of closing the question and doing nothing.
            .disabled(giftCode.trimmed.isEmpty)
            Button("Cancel", role: .cancel) {}
        }
        .alert(problem ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    // MARK: Cards

    /// The total with its pill, the status and when the order came in.
    private func summaryCard(_ order: CustomerOrder) -> some View {
        SettingsCard(spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                Text(Money.format(order.total))
                    .pfFont(24, .bold, relativeTo: .title2)
                Spacer(minLength: 8)
                OrderPillView(pill: order.pill)
            }
            SettingsValueRow(label: order.statusName, value: orders.dateAndTime(order.createdAt))
        }
    }

    /// How the customer collects it, and the time they asked for.
    private func collectCard(_ order: CustomerOrder) -> some View {
        SettingsCard(title: order.methodName, spacing: 10) {
            Text(order.scheduled.isEmpty ? "As soon as possible" : "Scheduled for \(orders.slotLabel(order.scheduled))")
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func customerCard(_ order: CustomerOrder) -> some View {
        SettingsCard(title: "Customer", spacing: 14) {
            if !order.name.trimmed.isEmpty {
                Text(order.name)
                    .pfFont(18, .bold)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // Each link is 44 pt tall and the card's width to press, without moving anything: the room is taken back outside it.
            if let phone = phoneURL(order.phone) {
                Link(destination: phone) {
                    Label(order.phone, systemImage: "phone")
                        .pfFont(16)
                        .foregroundStyle(Theme.blue)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                }
                .padding(.vertical, -12)
            }
            if let mail = mailURL(order.email) {
                Link(destination: mail) {
                    Label(order.email, systemImage: "envelope")
                        .pfFont(16)
                        .foregroundStyle(Theme.blue)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                }
                .padding(.vertical, -12)
            }
            if !order.address.trimmed.isEmpty {
                SettingsValueRow(label: "Deliver to", value: order.address, labelSize: 16)
            }
            if !order.vehicle.trimmed.isEmpty {
                SettingsValueRow(label: "Vehicle", value: order.vehicle, labelSize: 16)
            }
        }
    }

    private func notesCard(_ order: CustomerOrder) -> some View {
        SettingsCard(title: "Notes", spacing: 10) {
            Text(order.notes)
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
    }

    /// The lines with their options and prices, then the totals, as the website's order sheet lists them.
    private func itemsCard(_ order: CustomerOrder) -> some View {
        SettingsCard(title: "Items", spacing: 14) {
            ForEach(Array(order.lines.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(line.qty) × \(line.name)")
                            .pfFont(16, .medium)
                        if !line.options.isEmpty {
                            Text(line.options.joined(separator: ", "))
                                .pfFont(14)
                                .foregroundStyle(SettingsLook.muted)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Text(Money.format(line.total))
                        .pfFont(16)
                }
                .accessibilityElement(children: .combine)
            }
            Divider()
            VStack(spacing: 8) {
                amountRow("Subtotal", Money.format(order.subtotal))
                if order.discount > 0 {
                    amountRow(order.promo.isEmpty ? "Discount" : "Discount \(order.promo)", "−\(Money.format(order.discount))")
                }
                if order.tax > 0 { amountRow("Tax", Money.format(order.tax)) }
                if order.fee > 0 { amountRow("Delivery fee", Money.format(order.fee)) }
                if order.tip > 0 { amountRow("Tip", Money.format(order.tip)) }
                amountRow("Total", Money.format(order.total), bold: true)
                if order.gift > 0 {
                    amountRow(order.giftCode.isEmpty ? "Gift card" : "Gift card (\(order.giftCode))", "−\(Money.format(order.gift))")
                    amountRow("Left to pay", Money.format(order.due))
                }
            }
        }
    }

    /// How it was paid and when, or that it is not paid yet; and any refund.
    private func paymentCard(_ order: CustomerOrder) -> some View {
        SettingsCard(title: "Payment", spacing: 12) {
            if let paidAt = order.paidAt {
                HStack(spacing: 10) {
                    Image(systemName: CustomerOrder.tenderSymbol(order.paidMethod))
                        .font(.system(size: 17))
                        .accessibilityHidden(true)
                    SettingsValueRow(label: order.paidMethod.isEmpty ? "Paid" : "Paid · \(order.paidMethod)", value: orders.dateAndTime(paidAt), labelSize: 17)
                }
            } else if order.gift > 0 {
                SettingsValueRow(label: "Gift card paid \(Money.format(order.gift)) · \(Money.format(order.due)) to pay", labelSize: 17)
            } else {
                SettingsValueRow(label: "Not paid", labelSize: 17)
            }
            if order.refunded > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Refunded \(Money.format(order.refunded))")
                        .pfFont(17, .bold)
                        .foregroundStyle(Theme.error)
                    if !order.refundNote.trimmed.isEmpty {
                        Text(order.refundNote)
                            .pfFont(16)
                            .foregroundStyle(SettingsLook.muted)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: Actions

    private func actions(_ order: CustomerOrder) -> some View {
        VStack(spacing: 12) {
            if let next = order.nextStep {
                Button {
                    change(to: next.status)
                } label: {
                    if working { ProgressView().tint(.white) } else { Text(next.label) }
                }
                .buttonStyle(SolidButtonStyle(radius: 8, height: 48, size: 17))
                .disabled(working)
            }
            if order.canRecordPayment {
                Button("Record payment") { choosingTender = true }
                    .buttonStyle(OutlineButtonStyle())
                    .disabled(working)
            }
            if order.canCancel {
                Button {
                    confirmCancel = true
                } label: {
                    // The whole 44 pt row is the button, not only its words.
                    Text("Cancel order")
                        .pfFont(17, .semibold)
                        .foregroundStyle(Theme.error)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .disabled(working)
            }
            Button {
                // A page of the tab's own stack, so going back to the list (a notification, a tab tap) closes it too. Only while
                // this order is the page in front: a second tap as the website opens does not open it twice.
                guard model.shell.orders.last == .order(orderID) else { return }
                model.shell.push(.page("orders"))
            } label: {
                Label("More on the website", systemImage: "arrow.up.forward.square")
                    .pfFont(17, .semibold)
                    .foregroundStyle(Theme.blue)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
        .padding(.top, 4)
    }

    private func amountRow(_ label: String, _ value: String, bold: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .pfFont(16, bold ? .bold : .regular)
                .foregroundStyle(bold ? Color.primary : SettingsLook.muted)
            Spacer(minLength: 8)
            Text(value)
                .pfFont(16, bold ? .bold : .regular)
                .foregroundStyle(bold ? Color.primary : SettingsLook.muted)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: Words from the website

    private var cancelTitle: String { order.map { "Cancel order #\(String($0.number))?" } ?? "Cancel order?" }

    private var cancelText: String {
        "The customer is told by email and any stock is returned." + ((order?.gift ?? 0) > 0 ? " The gift card gets its balance back." : "")
    }

    private var tenderTitle: String { order.map { "Record payment for #\(String($0.number))" } ?? "Record payment" }

    private var tenderText: String {
        guard let order else { return "" }
        return "\(Money.format(order.due)) from \(order.name)" + (order.gift > 0 ? ", after \(Money.format(order.gift)) paid by gift card." : ".")
    }

    private var giftTitle: String { order.map { "Gift card for #\(String($0.number))" } ?? "Gift card" }

    // MARK: Talking to the server

    private func change(to status: String) {
        guard let order, let business = model.site, !working else { return }
        working = true
        model.idle.touch()
        let tapped = Date()
        Task {
            do {
                let fresh = try await orders.setStatus(order, to: status, siteID: business.id)
                snapshot = fresh
                Haptics.success()
                // A cancelled order puts its stock back, so the Sale screen loads the items again next time.
                if status == "cancelled" { model.shell.order.invalidate() }
            } catch let error as APIError {
                await Self.settled(since: tapped)
                failed(error)
            } catch {
                // Cancelled: the screen went away.
            }
            working = false
        }
    }

    private func pay(_ tender: String, giftCode: String? = nil) {
        guard let order, let business = model.site, !working else { return }
        working = true
        model.idle.touch()
        let tapped = Date()
        Task {
            do {
                let fresh = try await orders.recordPayment(order, tender: tender, giftCode: giftCode, siteID: business.id)
                snapshot = fresh
                Haptics.success()
                show("#\(String(fresh.number)) paid by \(tender.lowercased())")
            } catch let error as APIError {
                await Self.settled(since: tapped)
                failed(error)
            } catch {
                // Cancelled: the screen went away.
            }
            working = false
        }
    }

    /// Two alerts cannot be up at once: a refusal that follows an alert's own button (Cancel order, a tender, the gift card's Pay)
    /// waits until that alert has gone, as Closeout and Items wait. A quick answer from the server used to arrive while the
    /// first alert was still closing, and its message was never shown.
    private static func settled(since tapped: Date) async {
        let left = min(0.45, 0.45 - Date().timeIntervalSince(tapped))
        if left > 0 { try? await Task.sleep(nanoseconds: UInt64(left * 1_000_000_000)) }
    }

    /// The server's own words. A 401 is checked (and locks only if the session really ended); a 403 or a conflict is a message,
    /// and the list is loaded again so the screen shows what is true now.
    private func failed(_ error: APIError) {
        Haptics.error()
        if error.status == 401 {
            model.sessionEnded()
            return
        }
        problem = error.message
        Task { await reload() }
    }

    private func show(_ text: String) {
        withAnimation(.snappy) { toast = text }
        Task {
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            withAnimation(.easeOut(duration: 0.25)) { if toast == text { toast = nil } }
        }
    }

    private func reload() async {
        guard let business = model.site else { return }
        await orders.load(siteID: business.id)
    }

    /// Fresh now, then every 20 seconds while this order is on screen and the app is open and unlocked.
    private func poll() async {
        guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
        while !Task.isCancelled {
            await orders.load(siteID: business.id)
            try? await Task.sleep(nanoseconds: 20_000_000_000)
        }
    }

    private func phoneURL(_ phone: String) -> URL? {
        let digits = phone.filter { $0.isASCII && ($0.isNumber || $0 == "+") }
        guard digits.filter(\.isNumber).count >= 3 else { return nil }
        return URL(string: "tel:\(digits)")
    }

    private func mailURL(_ email: String) -> URL? {
        let address = email.trimmed
        guard address.contains("@") else { return nil }
        if let url = URL(string: "mailto:\(address)") { return url }
        return address.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed).flatMap { URL(string: "mailto:\($0)") }
    }
}
