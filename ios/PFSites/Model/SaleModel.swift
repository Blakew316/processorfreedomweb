import Foundation
import Observation

/// One line of the order being built on the Sale screen.
struct OrderLine: Identifiable, Hashable {
    let id: String
    var itemID: String?   // nil for a custom item
    var name: String
    var price: Int        // cents for one
    var qty: Int
    var total: Int { price * qty }
}

/// A category on the Sale screen's category sheet, with how many items it has.
struct CategoryCount: Identifiable, Hashable {
    let name: String
    let count: Int
    var id: String { name }
}

/// Product codes (the number on an item's barcode, or the business's own SKU), compared the way the server and the website
/// compare them (normalizeCode in shared/core.js), so one barcode always finds one item: spaces, dashes and characters no one can
/// see are taken out, letters are put in capitals, and a 13-digit EAN that starts with 0 is read as the 12-digit UPC-A it holds.
enum ProductCode {
    static func normalize(_ code: String) -> String {
        // Like the website's str(code, 200): at most 200 UTF-16 units are looked at.
        let head = String(decoding: Array(code.utf16.prefix(200)), as: UTF16.self)
        var kept = String.UnicodeScalarView()
        for scalar in head.unicodeScalars where !removed(scalar) { kept.append(scalar) }
        let upper = String(kept).uppercased()
        let bytes = Array(upper.utf8)
        if bytes.count == 13, bytes[0] == UInt8(ascii: "0"), bytes.allSatisfy({ $0 >= UInt8(ascii: "0") && $0 <= UInt8(ascii: "9") }) {
            return String(upper.dropFirst())
        }
        return upper
    }

    /// The characters the website's pattern takes out: white space (\s), "-", the Unicode dashes U+2010 to U+2015, the minus sign
    /// U+2212, control characters (Cc) and format characters (Cf, such as a zero-width space or a soft hyphen).
    private static func removed(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x2D, 0x2010...0x2015, 0x2212:
            return true
        default:
            break
        }
        switch scalar.properties.generalCategory {
        case .control, .format, .spaceSeparator, .lineSeparator, .paragraphSeparator:
            return true
        default:
            return false
        }
    }
}

/// What a barcode read on the Sale screen came to.
enum ScanResult {
    case added(String)          // the item's name: it is in the order now
    case needsPrice(MenuItem)   // a variable-price item: the price keypad comes first
    case soldOut(String)
    case notFound(String)       // the code as it was read
    case failed(String)         // the items could not be loaded
}

/// The Sale screen: the business's items, and the order being built on this phone before it is handed to the website's
/// Virtual Terminal to check out. The order belongs to this phone only; the items and the Sale settings come from the server.
@Observable @MainActor
final class SaleModel {
    var items: [MenuItem] = []
    var loading = false
    var loadError = ""
    /// The first look at this business's items and Sale settings has finished, well or not. Until then the screen shows its spinner:
    /// never "No items yet" before anything was asked, and never a list drawn before it is known whether item photos are shown.
    var settled = false
    var search = ""
    var category: String? = nil    // nil shows all items
    var lines: [OrderLine] = []
    /// The business's Sale settings (ordering.sale on the server), so every device behaves the same.
    var groupItems = true
    var stayInCategory = false
    /// ordering.sale.customName: a custom item needs a name before it can be added.
    var customNameRequired = false
    /// ordering.sale.images: the item list shows each item's photo.
    var showImages = false

    @ObservationIgnored private var loadedAt: Date?
    @ObservationIgnored private var loadedSite = ""
    /// Each item's product code as the scanner compares it, to the item's id.
    @ObservationIgnored private var codeIndex: [String: String] = [:]
    /// Each item's product code, for the search field.
    @ObservationIgnored private var codesByItem: [String: String] = [:]
    /// The load of the items in progress, so the screen and the scanner never ask twice at once.
    @ObservationIgnored private var itemsLoad: (site: String, task: Task<Void, Never>)?

    var total: Int { lines.reduce(0) { $0 + $1.total } }
    var isEmpty: Bool { lines.isEmpty }

    /// Categories in the order the items come in (the website's menu order), each with its item count.
    var categories: [CategoryCount] {
        var names: [String] = []
        var counts: [String: Int] = [:]
        for item in items {
            if counts[item.category] == nil { names.append(item.category) }
            counts[item.category, default: 0] += 1
        }
        return names.map { CategoryCount(name: $0, count: counts[$0] ?? 0) }
    }

    /// The items shown: the chosen category, narrowed by the search words (the name ignoring case, or the product code).
    var shown: [MenuItem] {
        let words = search.trimmed
        let code = ProductCode.normalize(words)
        return items.filter { item in
            guard category == nil || item.category == category else { return false }
            if words.isEmpty || item.name.localizedCaseInsensitiveContains(words) { return true }
            guard !code.isEmpty, let own = codesByItem[item.id] else { return false }
            return own.contains(code)
        }
    }

    func quantity(of item: MenuItem) -> Int {
        lines.filter { $0.itemID == item.id }.reduce(0) { $0 + $1.qty }
    }

    // MARK: Loading

    /// The Sale screen came into view: the Sale settings are read again every time (they are the business's, changed on the website
    /// or another phone), and the items when the last load is more than 30 seconds old.
    func appeared(siteID: String) async {
        await look(siteID: siteID, fresh: false)
    }

    /// Loads the items when they are more than 30 seconds old, so items changed on the website or another phone show up.
    func refreshIfNeeded(siteID: String) async {
        if loadedSite == siteID, let at = loadedAt, Date().timeIntervalSince(at) < 30 { return }
        await loadItems(siteID: siteID)
    }

    /// Pull to refresh and Try again: the items and the Sale settings.
    func load(siteID: String) async {
        await look(siteID: siteID, fresh: true)
    }

    /// The Sale settings and the items, asked for together. The first time, the list also waits for the settings (they say whether
    /// item photos show, so the list is not drawn one way and then the other), but only a moment on a slow connection.
    private func look(siteID: String, fresh: Bool) async {
        async let settings: Void = loadSettings(siteID: siteID)
        if fresh { await loadItems(siteID: siteID) } else { await refreshIfNeeded(siteID: siteID) }
        let patience: Task<Void, Never>? = settled ? nil : Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if !Task.isCancelled { self?.settle() }
        }
        await settings
        patience?.cancel()
        settle()
    }

    /// The first answers are in (or failed). A look that was cut short, because the screen went away, is finished by the next one.
    private func settle() {
        if !settled, !Task.isCancelled { settled = true }
    }

    /// Something changed the items on the server (an order was cancelled and its stock returned): the next look loads them again.
    func invalidate() {
        loadedAt = nil
    }

    func loadItems(siteID: String) async {
        if let running = itemsLoad, running.site == siteID {
            await running.task.value
            return
        }
        let task = Task { await self.fetchItems(siteID: siteID) }
        itemsLoad = (siteID, task)
        await task.value
        if itemsLoad?.site == siteID { itemsLoad = nil }
    }

    private func fetchItems(siteID: String) async {
        if loadedSite != siteID {
            items = []
            category = nil
            codeIndex = [:]
            codesByItem = [:]
        }
        loadedSite = siteID
        loading = items.isEmpty
        do {
            let answer = try await API.get("/api/sites/\(siteID)/menu")
            guard loadedSite == siteID else { return }
            let list = answer["items"].array
            items = list.compactMap { MenuItem($0) }
            var index: [String: String] = [:]
            var byItem: [String: String] = [:]
            for entry in list {
                let id = entry["id"].string
                let key = ProductCode.normalize(entry["code"].string)
                guard !id.isEmpty, !key.isEmpty else { continue }
                byItem[id] = key
                if index[key] == nil { index[key] = id }
            }
            codeIndex = index
            codesByItem = byItem
            loadError = ""
            loadedAt = Date()
            if let chosen = category, !items.contains(where: { $0.category == chosen }) { category = nil }
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            if items.isEmpty { loadError = error.message }
        } catch {
            // Cancelled: the screen went away.
        }
        loading = false
    }

    /// The business's Sale settings, kept on the server with the business (ordering.sale).
    func loadSettings(siteID: String) async {
        guard let answer = try? await API.get("/api/sites/\(siteID)") else { return }
        let sale = answer["site"]["ordering"]["sale"]
        guard sale.isObject else { return }
        let group = sale["groupItems"].exists ? sale["groupItems"].bool : true
        let stay = sale["stayInCategory"].bool
        if groupItems != group { groupItems = group }
        if stayInCategory != stay { stayInCategory = stay }
        let needName = sale["customName"].bool
        let images = sale["images"].bool
        if customNameRequired != needName { customNameRequired = needName }
        if showImages != images { showImages = images }
    }

    // MARK: The order

    /// Adds one of an item at its price (or at the amount keyed in for a variable-price item). With "group similar items" on, the
    /// same item at the same price adds to its line; a variable-price item keyed at another price gets its own line.
    func add(_ item: MenuItem, price: Int? = nil) {
        let cents = price ?? item.price
        if groupItems, let index = lines.firstIndex(where: { $0.itemID == item.id && $0.price == cents }) {
            lines[index].qty = min(999, lines[index].qty + 1)
        } else {
            lines.append(OrderLine(id: UUID().uuidString, itemID: item.id, name: item.name, price: cents, qty: 1))
        }
        if !stayInCategory { category = nil }
    }

    func addCustom(name: String, cents: Int) {
        let title = name.trimmed.isEmpty ? "Custom item" : name.trimmed
        lines.append(OrderLine(id: UUID().uuidString, itemID: nil, name: title, price: cents, qty: 1))
        // Like any item added: back to All items unless the business keeps the chosen category.
        if !stayInCategory { category = nil }
    }

    func change(_ line: OrderLine, by delta: Int) {
        guard let index = lines.firstIndex(where: { $0.id == line.id }) else { return }
        let qty = lines[index].qty + delta
        if qty <= 0 { lines.remove(at: index) } else { lines[index].qty = min(999, qty) }
    }

    func remove(at offsets: IndexSet) {
        for index in offsets.sorted(by: >) where lines.indices.contains(index) { lines.remove(at: index) }
    }

    func clear() { lines = [] }

    // MARK: The barcode scanner

    /// A barcode read by the camera: the item with that product code (the items are loaded again first when the last load is more
    /// than 30 seconds old, so a code just added on the website is found), added to the order when it can be sold.
    func scanned(_ raw: String, siteID: String) async -> ScanResult {
        let key = ProductCode.normalize(raw)
        let shownCode = raw.trimmed
        guard !key.isEmpty else { return .notFound(shownCode) }
        if loadedSite != siteID || loadedAt.map({ Date().timeIntervalSince($0) >= 30 }) ?? true {
            await loadItems(siteID: siteID)
            // The scanner was closed while the items were on their way: nothing is added behind the person's back.
            if Task.isCancelled { return .failed("") }
        }
        if items.isEmpty && !loadError.isEmpty { return .failed(loadError) }
        guard let id = codeIndex[key], let item = items.first(where: { $0.id == id }) else { return .notFound(shownCode) }
        if item.soldOut { return .soldOut(item.name) }
        if item.variable { return .needsPrice(item) }
        add(item)
        return .added(item.name)
    }

    // MARK: Check out

    /// "2 × Coffee, 1 × Bagel", the note the Virtual Terminal keeps with the payment. Its note box holds 500 characters as
    /// JavaScript counts them (UTF-16 units; PF.sale cuts anything longer there), so a longer order keeps its first whole lines and
    /// ends with ", …".
    var note: String {
        let most = 500
        let parts = lines.map { "\($0.qty) × \($0.name.trimmed)" }
        let all = parts.joined(separator: ", ")
        if all.utf16.count <= most { return all }
        var kept = ""
        for part in parts {
            let next = kept.isEmpty ? part : kept + ", " + part
            // Room is left for ", …" (3 units).
            guard next.utf16.count <= most - 3 else { break }
            kept = next
        }
        if !kept.isEmpty { return kept + ", …" }
        // The first line alone is longer than that: as much of it as fits, then "…".
        var cut = ""
        for character in parts[0] {
            guard cut.utf16.count + character.utf16.count <= most - 1 else { break }
            cut.append(character)
        }
        return cut.trimmed + "…"
    }

    /// The script that fills the website's Virtual Terminal (PF.sale) once its page is up.
    static func handOffScript(sub: String, note: String) -> String {
        let payload: [String: Any] = ["sub": sub, "note": note]
        let json = (try? JSONSerialization.data(withJSONObject: payload)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        // PF.sale answers whether it filled the Virtual Terminal; false (or no PF.sale yet) lets the page try once more (OfficePage).
        return "(function(){ if (window.PF && typeof window.PF.sale === 'function') { return window.PF.sale(\(json)) !== false; } return false; })()"
    }
}
