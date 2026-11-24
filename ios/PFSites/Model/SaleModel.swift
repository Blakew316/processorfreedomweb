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

/// The Sale screen: the business's items, and the order being built on this phone before it is handed to the website's
/// Virtual Terminal to check out. The order belongs to this phone only; the items and the Sale settings come from the server.
@Observable @MainActor
final class SaleModel {
    var items: [MenuItem] = []
    var loading = false
    var loadError = ""
    var search = ""
    var category: String? = nil    // nil shows all items
    var lines: [OrderLine] = []
    /// The business's Sale settings (ordering.sale on the server), so every device behaves the same.
    var groupItems = true
    var stayInCategory = false

    @ObservationIgnored private var loadedAt: Date?
    @ObservationIgnored private var loadedSite = ""

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

    /// The items shown: the chosen category, narrowed by the search words (name, ignoring case).
    var shown: [MenuItem] {
        let words = search.trimmed
        return items.filter { item in
            (category == nil || item.category == category) && (words.isEmpty || item.name.localizedCaseInsensitiveContains(words))
        }
    }

    func quantity(of item: MenuItem) -> Int {
        lines.filter { $0.itemID == item.id }.reduce(0) { $0 + $1.qty }
    }

    /// Loads the items when the screen shows (again after 30 seconds, so items changed on the website or another phone show up).
    func refreshIfNeeded(siteID: String) async {
        if loadedSite == siteID, let at = loadedAt, Date().timeIntervalSince(at) < 30 { return }
        await load(siteID: siteID)
    }

    func load(siteID: String) async {
        if loadedSite != siteID { items = []; category = nil }
        loadedSite = siteID
        loading = items.isEmpty
        do {
            let answer = try await API.get("/api/sites/\(siteID)/menu")
            items = answer["items"].array.compactMap { MenuItem($0) }
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
        if let site = try? await API.get("/api/sites/\(siteID)") {
            let sale = site["site"]["ordering"]["sale"]
            groupItems = sale["groupItems"].exists ? sale["groupItems"].bool : true
            stayInCategory = sale["stayInCategory"].bool
        }
    }

    /// Adds one of an item at its price (or at the amount keyed in for a variable-price item).
    func add(_ item: MenuItem, price: Int? = nil) {
        let cents = price ?? item.price
        if groupItems, let index = lines.firstIndex(where: { $0.itemID == item.id && $0.price == cents }) {
            lines[index].qty += 1
        } else {
            lines.append(OrderLine(id: UUID().uuidString, itemID: item.id, name: item.name, price: cents, qty: 1))
        }
        if !stayInCategory { category = nil }
    }

    func addCustom(name: String, cents: Int) {
        let title = name.trimmed.isEmpty ? "Custom item" : name.trimmed
        lines.append(OrderLine(id: UUID().uuidString, itemID: nil, name: title, price: cents, qty: 1))
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

    /// "2 × Coffee, 1 × Bagel", the note the Virtual Terminal keeps with the payment.
    var note: String { String(lines.map { "\($0.qty) × \($0.name)" }.joined(separator: ", ").prefix(500)) }

    /// The script that fills the website's Virtual Terminal (PF.sale) once its page is up.
    static func handOffScript(sub: String, note: String) -> String {
        let payload: [String: Any] = ["sub": sub, "note": note]
        let json = (try? JSONSerialization.data(withJSONObject: payload)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return "(function(){ if (window.PF && typeof window.PF.sale === 'function') { window.PF.sale(\(json)); return true; } return false; })()"
    }
}
