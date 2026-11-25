import ImageIO
import SwiftUI
import UIKit

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
            // The photo: the glass 10 pt inside the field, the words 40.7 pt inside it and a point above its middle.
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 17.3))
                    .foregroundStyle(.primary)
                    .accessibilityHidden(true)
                TextField(text: $sale.search, prompt: Text("Search all items").foregroundStyle(SaleLook.muted)) {
                    Text("Search all items")
                }
                .pfFont(17)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .padding(.bottom, 2)
                .onChange(of: sale.search) { _, _ in model.idle.touch() }
                if !sale.search.isEmpty {
                    Button {
                        sale.search = ""
                    } label: {
                        // As much room to press as fits beside the barcode button; the cross itself stays where it was.
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .frame(width: 36, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, -8)
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
            .padding(.leading, 8)
            .padding(.trailing, 13)
            .frame(minHeight: 50)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(SaleLook.field))
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            SaleHairline()

            // The photo's two links are the same size (its "All items" is 65 pt wide), the triangle 11.3 pt after the words and
            // level with the small letters, the ring 6 pt before "Custom item".
            HStack {
                Button {
                    showCategories = true
                } label: {
                    HStack(spacing: 10.5) {
                        Text(order.category ?? "All items")
                            .lineLimit(1)
                        DropCaret()
                            .frame(width: 10, height: 5.5)
                            .offset(y: 1)
                            .accessibilityHidden(true)
                    }
                    .pfFont(16.25, .semibold)
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
                    HStack(spacing: 5) {
                        PlusRing()
                            .stroke(style: StrokeStyle(lineWidth: 2, lineCap: .round))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text("Custom item")
                            .pfFont(16.25, .semibold)
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
        // The spinner until the first answers are in ("No items yet" is only said once the server has said so), and while Try again
        // is asking. A later look at a business with no items keeps "No items yet" up instead of flashing the spinner.
        if !order.settled || (order.loading && order.items.isEmpty && !order.loadError.isEmpty) {
            Spacer()
            ProgressView().controlSize(.large).tint(Theme.blue)
            Spacer()
        } else if !order.loadError.isEmpty && order.items.isEmpty {
            Spacer()
            VStack(spacing: 14) {
                Text(order.loadError)
                    .pfFont(17)
                    .foregroundStyle(SettingsLook.muted)
                    .multilineTextAlignment(.center)
                Button("Try again") { reload(order) }
                    .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                    .frame(maxWidth: 200)
            }
            .padding(.horizontal, 32)
            Spacer()
        } else if order.items.isEmpty {
            // Pulling down asks again, so items just added on the website show without leaving the screen.
            ScrollView {
                ContentUnavailableView("No items yet", systemImage: "tag")
                    .containerRelativeFrame(.vertical)
            }
            .refreshable { await refreshItems() }
        } else {
            ScrollView {
                LazyVStack(spacing: 16) {
                    let shown = order.shown
                    if shown.isEmpty {
                        Text("No items match \u{201C}\(order.search.trimmed)\u{201D}.")
                            .pfFont(17)
                            .foregroundStyle(SettingsLook.muted)
                            .multilineTextAlignment(.center)
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
            // The photo's card: 80 pt tall, its words 16 pt in (a long name runs to the same 16 pt from the other side), the name's
            // baseline 33 pt down and the price's 24 pt under it.
            HStack(alignment: .center, spacing: 12) {
                if order.showImages {
                    SaleItemPhoto(path: item.image)
                }
                VStack(alignment: .leading, spacing: 3.67) {
                    Text(item.name)
                        .pfFont(17)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(item.soldOut ? "Sold out" : item.variable ? "Variable price" : Money.format(item.price))
                        .pfFont(17)
                        .foregroundStyle(SaleLook.muted)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if count > 0 {
                    // Said by the card's value ("2 in the order"), so VoiceOver does not also read "times 2".
                    Text("×\(count)")
                        .pfFont(17, .semibold)
                        .monospacedDigit()
                        .foregroundStyle(Theme.blue)
                        .contentTransition(.numericText())
                        .accessibilityHidden(true)
                }
            }
            .animation(.snappy(duration: 0.2), value: count)
            .padding(.horizontal, 16)
            .padding(.top, 16.67)
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
        // The photo, from the line at the top of the panel: "Total" and the amount on a baseline 43 pt down with 12.3 pt between
        // them, "View order" 3.3 pt higher, the buttons 68 pt down.
        return VStack(spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                Button {
                    showOrder = true
                } label: {
                    // 44 pt tall to press; the room is taken back outside it, so the words stay where they are.
                    Text("View order")
                        .pfFont(17, .semibold)
                        .foregroundStyle(empty ? SaleLook.disabled : Theme.blue)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                }
                .disabled(empty)
                .padding(.trailing, -12)
                .padding(.vertical, -12)
                .alignmentGuide(.firstTextBaseline) { size in size[.firstTextBaseline] + 3.33 }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("Total")
                        .pfFont(20, .bold)
                    Text(Money.format(order.total))
                        .pfFont(20, .bold)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
                // The amount rolls to its new value, and "Total" glides aside with it, when the order changes.
                .animation(.snappy(duration: 0.2), value: order.total)
                .accessibilityElement(children: .combine)
            }
            HStack(spacing: 8) {
                // 46 pt inside the 48 pt options box, as in the photo.
                Button("Check out") { checkOut(order) }
                    .buttonStyle(SolidButtonStyle(fill: order.payable ? Theme.blue : SaleLook.disabled, text: .white, radius: 4, height: 46, size: 18.5))
                    .disabled(!order.payable)
                Menu {
                    Button("Clear order", role: .destructive) { order.clear() }
                        .disabled(empty)
                } label: {
                    // The photo's three dots: 4 pt each, 6 pt apart.
                    VStack(spacing: 2) {
                        ForEach(0..<3, id: \.self) { _ in
                            Circle().fill(SaleLook.dots).frame(width: 4, height: 4)
                        }
                    }
                    .frame(width: 48, height: 48)
                    .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(SaleLook.disabled, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Order options")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 23.5)
        .padding(.bottom, 15)
        .background(SaleLook.panel)
        .overlay(alignment: .top) { SaleHairline() }
    }

    /// Hands the order to the website's Virtual Terminal (its real checkout) with the total and a note of what was sold.
    private func checkOut(_ order: SaleModel) {
        // Only from the Sale screen itself: a second tap while the terminal is already opening does not open it twice.
        guard order.payable, model.shell.sale.isEmpty else { return }
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

/// An item's photo on the Sale list, when the business turned on item images (Settings → Item images): the item's own photo, or a
/// light grey square with a picture icon when it has none, so the names stay lined up.
private struct SaleItemPhoto: View {
    let path: String
    @Environment(\.displayScale) private var displayScale
    @State private var picture: UIImage?

    init(path: String) {
        self.path = path
        // A photo already fetched is there from the first frame (an item coming back into the list does not blink).
        _picture = State(initialValue: SaleItemPhotos.kept(path))
    }

    var body: some View {
        ZStack {
            placeholder
            if let picture {
                Image(uiImage: picture)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .accessibilityHidden(true)
        .task(id: path) {
            // A new photo fades in over the grey square when it arrives, rather than popping in.
            let kept = SaleItemPhotos.kept(path)
            if picture !== kept { picture = kept }
            guard kept == nil, !path.isEmpty else { return }
            if let small = await SaleItemPhotos.fetch(path, side: 48 * displayScale) {
                withAnimation(.easeOut(duration: 0.2)) { picture = small }
            }
        }
    }

    private var placeholder: some View {
        ZStack {
            Color(.secondarySystemBackground)
            Image(systemName: "photo")
                .font(.system(size: 18))
                .foregroundStyle(.tertiary)
        }
    }
}

/// The Sale list's item photos, made small (the list shows them 48 pt square) and kept while the app runs. A long list of full-size
/// photos would fill the phone's memory, and a photo should not be fetched again each time its item comes back into the list.
private enum SaleItemPhotos {
    private static let store: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 600
        return cache
    }()

    static func kept(_ path: String) -> UIImage? {
        path.isEmpty ? nil : store.object(forKey: path as NSString)
    }

    /// Fetches the photo and draws it small: about twice the square's side in pixels, because the square is filled and a wide or
    /// tall photo needs the extra. Nothing comes back for a file iOS cannot draw (an SVG) or one that could not be fetched.
    static func fetch(_ path: String, side: CGFloat) async -> UIImage? {
        guard let (data, response) = try? await URLSession.shared.data(from: Config.url(path)),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(96, side * 2)
        ]
        guard let small = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let image = UIImage(cgImage: small)
        store.setObject(image, forKey: path as NSString)
        return image
    }
}
