import SwiftUI

/// Sale (photos 4 and 5): find items (by name, or with the camera's barcode scanner), build the order, then check out on the
/// website's own Virtual Terminal.
struct SaleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var showCategories = false
    @State private var showOrder = false
    @State private var showScanner = false
    @State private var keypadItem: KeypadTarget?

    /// The refresh runs again whenever one of these changes: the app in front, open (not locked), and which business.
    private struct RefreshKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
    }

    var body: some View {
        let order = model.shell.order
        @Bindable var sale = order
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18))
                    .foregroundStyle(.primary)
                    .accessibilityHidden(true)
                TextField(text: $sale.search, prompt: Text("Search all items").foregroundStyle(SaleLook.muted)) {
                    Text("Search all items")
                }
                .pfFont(17)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onChange(of: sale.search) { _, _ in model.idle.touch() }
                if !sale.search.isEmpty {
                    Button {
                        sale.search = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Clear search")
                }
                Button {
                    model.idle.touch()
                    showScanner = true
                } label: {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 19))
                        .foregroundStyle(Theme.blue)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, -8)
                .accessibilityLabel("Scan a barcode")
            }
            .padding(.leading, 10)
            .padding(.trailing, 13)
            .frame(minHeight: 50)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(SaleLook.field))
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            SaleHairline()

            HStack {
                Button {
                    showCategories = true
                } label: {
                    HStack(spacing: 13) {
                        Text(order.category ?? "All items")
                            .lineLimit(1)
                        DropCaret()
                            .frame(width: 10, height: 5.5)
                            .accessibilityHidden(true)
                    }
                    .pfFont(17.5, .semibold)
                    .foregroundStyle(Theme.blue)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Category, \(order.category ?? "All items")")
                Spacer(minLength: 12)
                Button {
                    keypadItem = .custom
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle")
                            .font(.system(size: 19, weight: .medium))
                            .accessibilityHidden(true)
                        Text("Custom item")
                            .pfFont(17, .semibold)
                    }
                    .foregroundStyle(Theme.blue)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 22)
            .padding(.trailing, 16)
            .frame(minHeight: 53)
            SaleHairline()

            itemList(order)
        }
        .safeAreaInset(edge: .bottom) { orderPanel(order) }
        .background(Color(.systemBackground))
        .tabHeader("Sale", kind: .sale)
        .task(id: RefreshKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            // The Sale settings are read again every time the screen comes into view, and again when the app comes back to the
            // front or is unlocked (the screen stays put under the lock); the items when they are 30 seconds old.
            guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
            await order.appeared(siteID: business.id)
        }
        .sheet(isPresented: $showCategories) {
            CategorySheet(order: order)
        }
        .sheet(isPresented: $showOrder) {
            OrderSheet(order: order)
        }
        .sheet(item: $keypadItem) { target in
            PriceKeypadSheet(target: target, order: order)
        }
        .fullScreenCover(isPresented: $showScanner) {
            if let business = model.site {
                SaleScannerView(order: order, siteID: business.id) { code in
                    order.category = nil
                    order.search = code
                }
                .environment(model)
            }
        }
    }

    // MARK: Items

    @ViewBuilder
    private func itemList(_ order: SaleModel) -> some View {
        if order.loading && order.items.isEmpty {
            Spacer()
            ProgressView().controlSize(.large).tint(Theme.blue)
            Spacer()
        } else if !order.loadError.isEmpty && order.items.isEmpty {
            Spacer()
            VStack(spacing: 14) {
                Text(order.loadError)
                    .pfFont(17)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Try again") { reload(order) }
                    .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                    .frame(maxWidth: 200)
            }
            .padding(.horizontal, 32)
            Spacer()
        } else if order.items.isEmpty {
            Spacer()
            ContentUnavailableView("No items yet", systemImage: "tag")
            Spacer()
        } else {
            ScrollView {
                LazyVStack(spacing: 16) {
                    let shown = order.shown
                    if shown.isEmpty {
                        Text("No items match \u{201C}\(order.search.trimmed)\u{201D}.")
                            .pfFont(17)
                            .foregroundStyle(.secondary)
                            .padding(.top, 24)
                    }
                    ForEach(shown) { item in
                        itemCard(item, order: order)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await refreshItems() }
        }
    }

    /// An item: its name, and its price (or "Variable price", or "Sold out") under it; the quantity in the order at the right.
    private func itemCard(_ item: MenuItem, order: SaleModel) -> some View {
        let count = order.quantity(of: item)
        return Button {
            guard !item.soldOut else { return }
            model.idle.touch()
            if item.variable {
                keypadItem = .item(item)
            } else {
                order.add(item)
                Haptics.light()
            }
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name)
                        .pfFont(17)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(item.soldOut ? "Sold out" : item.variable ? "Variable price" : Money.format(item.price))
                        .pfFont(17)
                        .foregroundStyle(SaleLook.muted)
                }
                Spacer(minLength: 8)
                if count > 0 {
                    Text("×\(count)")
                        .pfFont(17, .semibold)
                        .foregroundStyle(Theme.blue)
                }
            }
            .padding(.horizontal, 17)
            .padding(.top, 17)
            .padding(.bottom, 19)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Color(.systemBackground)))
            .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(SaleLook.cardBorder, lineWidth: 1))
            .opacity(item.soldOut ? 0.6 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(item.soldOut)
        .accessibilityValue(count > 0 ? "\(count) in the order" : "")
    }

    // MARK: The order panel

    private func orderPanel(_ order: SaleModel) -> some View {
        let empty = order.isEmpty
        return VStack(spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                Button("View order") { showOrder = true }
                    .pfFont(17)
                    .foregroundStyle(empty ? SaleLook.disabled : Theme.blue)
                    .disabled(empty)
                    .padding(.leading, 12)
                Spacer()
                Text("Total")
                    .pfFont(20, .bold)
                Text(Money.format(order.total))
                    .pfFont(20, .bold)
                    .padding(.leading, 8)
            }
            .accessibilityElement(children: .contain)
            HStack(spacing: 8) {
                // 46 pt inside the 48 pt options box, as in the photo.
                Button("Check out") { checkOut(order) }
                    .buttonStyle(SolidButtonStyle(fill: empty ? SaleLook.disabled : Theme.blue, text: .white, radius: 4, height: 46, size: 20))
                    .disabled(empty)
                Menu {
                    Button("Clear order", role: .destructive) { order.clear() }
                        .disabled(empty)
                } label: {
                    Image(systemName: "ellipsis")
                        .rotationEffect(.degrees(90))
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(SaleLook.dots)
                        .frame(width: 48, height: 48)
                        .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(SaleLook.disabled, lineWidth: 1))
                }
                .accessibilityLabel("Order options")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 23)
        .padding(.bottom, 15)
        .background(SaleLook.panel)
        .overlay(alignment: .top) { SaleHairline() }
    }

    /// Hands the order to the website's Virtual Terminal (its real checkout) with the total and a note of what was sold.
    private func checkOut(_ order: SaleModel) {
        guard !order.isEmpty else { return }
        model.shell.sale.append(.checkout(sub: Money.decimal(order.total), note: order.note))
    }

    private func reload(_ order: SaleModel) {
        guard let business = model.site else { return }
        Task { await order.load(siteID: business.id) }
    }

    private func refreshItems() async {
        guard let business = model.site else { return }
        await model.shell.order.load(siteID: business.id)
    }
}

/// The Sale header's menu: the Virtual Terminal on its own, and clearing the order.
struct SaleMenuButton: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let order = model.shell.order
        Menu {
            Button("Virtual Terminal", systemImage: "creditcard") {
                model.shell.sale.append(.page("sale"))
            }
            if !order.isEmpty {
                Button("Clear order", systemImage: "trash", role: .destructive) { order.clear() }
            }
        } label: {
            Image(systemName: "line.3.horizontal")
        }
        .accessibilityLabel("Sale options")
    }
}

/// What the price keypad is for: a variable-price item, or a custom item.
enum KeypadTarget: Identifiable {
    case item(MenuItem)
    case custom

    var id: String {
        switch self {
        case .item(let item): return "item-\(item.id)"
        case .custom: return "custom"
        }
    }
}
