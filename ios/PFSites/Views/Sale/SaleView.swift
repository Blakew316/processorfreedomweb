import SwiftUI

/// Sale (photos 4 and 5): find items, build the order, then check out on the website's own Virtual Terminal.
struct SaleView: View {
    @Environment(AppModel.self) private var model
    @State private var showCategories = false
    @State private var showOrder = false
    @State private var keypadItem: KeypadTarget?

    var body: some View {
        let order = model.shell.order
        @Bindable var sale = order
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 20))
                    .accessibilityHidden(true)
                TextField("Search all items", text: $sale.search)
                    .pfFont(20)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onChange(of: sale.search) { _, _ in model.idle.touch() }
                // Items have no barcodes yet, so the scanner is shown but not available.
                Image(systemName: "barcode.viewfinder")
                    .font(.system(size: 22))
                    .foregroundStyle(Color(.tertiaryLabel))
                    .accessibilityLabel("Scan a barcode, not available yet")
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color(.systemGray6)))
            .padding(.horizontal, 17)
            .padding(.vertical, 12)
            Divider()

            HStack {
                Button {
                    showCategories = true
                } label: {
                    HStack(spacing: 10) {
                        Text(order.category ?? "All items")
                            .lineLimit(1)
                        Image(systemName: "arrowtriangle.down.fill")
                            .font(.system(size: 12))
                    }
                    .pfFont(20, .semibold)
                    .foregroundStyle(Theme.blue)
                }
                .accessibilityLabel("Category, \(order.category ?? "All items")")
                Spacer(minLength: 12)
                Button {
                    keypadItem = .custom
                } label: {
                    Label("Custom item", systemImage: "plus.circle")
                        .pfFont(20, .semibold)
                        .foregroundStyle(Theme.blue)
                }
            }
            .padding(.horizontal, 17)
            .padding(.vertical, 14)
            Divider()

            itemList(order)
        }
        .safeAreaInset(edge: .bottom) { orderPanel(order) }
        .background(Color(.systemBackground))
        .tabHeader("Sale", kind: .sale)
        .task {
            if let business = model.site { await order.refreshIfNeeded(siteID: business.id) }
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
            ContentUnavailableView("No items yet", systemImage: "tag", description: Text("Add items on the website under More, Items. Custom item sells any amount."))
            Spacer()
        } else {
            ScrollView {
                LazyVStack(spacing: 18) {
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
                .padding(.horizontal, 17)
                .padding(.vertical, 18)
            }
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await refreshItems() }
        }
    }

    private func itemCard(_ item: MenuItem, order: SaleModel) -> some View {
        let count = order.quantity(of: item)
        return Button {
            guard !item.soldOut else { return }
            if item.variable {
                keypadItem = .item(item)
            } else {
                order.add(item)
                Haptics.light()
            }
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.name)
                        .pfFont(20)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(item.soldOut ? "Sold out" : item.variable ? "Variable price" : Money.format(item.price))
                        .pfFont(20)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                if count > 0 {
                    Text("×\(count)")
                        .pfFont(20, .semibold)
                        .foregroundStyle(Theme.blue)
                }
            }
            .padding(17)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Color(.systemBackground)))
            .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(Color(.systemGray3), lineWidth: 1))
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
        return VStack(spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Button("View order") { showOrder = true }
                    .pfFont(22)
                    .foregroundStyle(empty ? Color(.tertiaryLabel) : Theme.blue)
                    .disabled(empty)
                Spacer()
                Text("Total")
                    .pfFont(24, .bold)
                Text(Money.format(order.total))
                    .pfFont(24, .bold)
                    .padding(.leading, 10)
            }
            .accessibilityElement(children: .contain)
            HStack(spacing: 20) {
                Button("Check out") { checkOut(order) }
                    .buttonStyle(SolidButtonStyle(fill: empty ? Color(.systemGray3) : Theme.blue, text: .white, radius: 6, height: 48, size: 22))
                    .disabled(empty)
                Menu {
                    Button("Clear order", role: .destructive) { order.clear() }
                        .disabled(empty)
                } label: {
                    Image(systemName: "ellipsis")
                        .rotationEffect(.degrees(90))
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.primary)
                        .frame(width: 50, height: 48)
                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color(.systemGray3), lineWidth: 1))
                }
                .accessibilityLabel("Order options")
            }
        }
        .padding(17)
        .background(Color(.secondarySystemBackground))
        .overlay(alignment: .top) { Divider() }
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
