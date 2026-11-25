import Foundation
import Observation
import UIKit

// The data behind Home → Items and services: the business's items as the server keeps them (server/app.js toItem), the item
// settings they use (the site's ordering), and the website's rules for searching, filtering, bulk changes, the item list file
// and importing one (public/js/editor.js CL.items and importCsv, shared/core.js parseMenuCsv).

// MARK: - An item

/// One choice of an item's own option ("Large +1.50"). Hidden online or sold out are kept as they are.
struct ItemChoice: Hashable {
    var name: String
    var price: Int
    var online = true
    var inStock = true

    init(name: String, price: Int, online: Bool = true, inStock: Bool = true) {
        self.name = name
        self.price = price
        self.online = online
        self.inStock = inStock
    }

    init?(_ json: JSON) {
        let name = json["name"].string.trimmed
        guard !name.isEmpty else { return nil }
        self.name = name
        price = max(0, json["price"].int)
        online = json["online"].exists ? json["online"].bool : true
        inStock = json["inStock"].exists ? json["inStock"].bool : true
    }

    var body: [String: Any] { ["name": name, "price": price, "online": online, "inStock": inStock] }
}

/// One of an item's own options: sizes or add-ons, with its choices.
struct ItemOptionGroup: Hashable {
    var name: String
    var required: Bool
    var multi: Bool
    var choices: [ItemChoice]

    init?(_ json: JSON) {
        let name = json["name"].string.trimmed
        let choices = json["choices"].array.compactMap { ItemChoice($0) }
        guard !name.isEmpty, !choices.isEmpty else { return nil }
        self.name = name
        required = json["required"].bool
        multi = json["multi"].bool
        self.choices = choices
    }
}

/// An item with everything the server keeps about it. The Sale screen's `MenuItem` is a lighter view of the same item; this one
/// is for Items and services, which shows and edits all of it.
struct CatalogItem: Identifiable, Hashable {
    var id: String
    var name: String
    var category: String
    var color: String          // "#rrggbb", or "" for none
    var price: Int             // cents, the list price
    var cost: Int?             // cents, nil when none was entered
    var desc: String
    var image: String          // "/u/…" (an upload) or "https://…", or ""
    var available: Bool        // "Available to order"
    var stock: Int
    var restock: Int?          // refilled to this every morning, nil for off
    var mods: [String]         // the modifier groups it uses, by id
    var label: String          // printer label
    var revclass: String       // revenue class
    var taxable: Bool
    var sale: Int              // percent off, 0 to 90
    var options: [ItemOptionGroup]
    var variable: Bool         // priced at the counter each time it is sold
    var code: String           // product code: the barcode number or the business's own SKU

    init?(_ json: JSON) {
        let id = json["id"].string
        guard !id.isEmpty else { return nil }
        self.id = id
        name = json["name"].string
        category = json["category"].string.trimmed.isEmpty ? "Menu" : json["category"].string
        color = json["color"].string
        price = max(0, json["price"].int)
        cost = json["cost"].exists ? max(0, json["cost"].int) : nil
        desc = json["desc"].string
        image = json["image"].string
        available = json["available"].exists ? json["available"].bool : true
        stock = max(0, json["stock"].int)
        restock = json["restock"].exists ? max(0, json["restock"].int) : nil
        mods = json["mods"].array.map { $0.string }.filter { !$0.isEmpty }
        label = json["label"].string
        revclass = json["revclass"].string
        taxable = json["taxable"].exists ? json["taxable"].bool : true
        sale = min(90, max(0, json["sale"].int))
        options = json["options"].array.compactMap { ItemOptionGroup($0) }
        variable = json["variable"].bool
        code = json["code"].string
    }

    /// "Variable" for a price entered at the time of sale, otherwise the price, as the website's lists show it.
    var priceText: String { variable ? "Variable" : Money.format(price) }
}

// MARK: - The item settings the editor uses

/// The parts of the business's settings (GET /api/sites/<id>, site.ordering) that items use.
struct ItemsSettings {
    struct ModifierGroup: Identifiable, Hashable {
        let id: String
        let name: String
        let choices: Int
    }

    struct OnlineMenu: Identifiable, Hashable {
        let id: String
        let name: String
        let cats: [String]
    }

    var slug = ""
    var modGroups: [ModifierGroup] = []
    var labels: [String] = []
    var revClasses: [String] = []
    var lowStockAt = 5
    var cats: [String] = []
    var menus: [OnlineMenu] = []

    init() {}

    init(site: JSON) {
        slug = site["slug"].string
        let ordering = site["ordering"]
        modGroups = ordering["modGroups"].array.compactMap { group in
            let id = group["id"].string
            let name = group["name"].string.trimmed
            guard !id.isEmpty, !name.isEmpty else { return nil }
            return ModifierGroup(id: id, name: name, choices: group["choices"].array.count)
        }
        labels = ordering["labels"].array.map { $0.string.trimmed }.filter { !$0.isEmpty }
        revClasses = ordering["revClasses"].array.map { $0.string.trimmed }.filter { !$0.isEmpty }
        lowStockAt = ordering["lowStockAt"].exists ? max(0, ordering["lowStockAt"].int) : 5
        cats = ordering["cats"].array.map { $0["name"].string.trimmed }.filter { !$0.isEmpty }
        menus = ordering["menus"].array.compactMap { menu in
            let id = menu["id"].string
            let name = menu["name"].string.trimmed
            guard !name.isEmpty else { return nil }
            return OnlineMenu(id: id.isEmpty ? name : id, name: name, cats: menu["cats"].array.map { $0.string.trimmed }.filter { !$0.isEmpty })
        }
    }
}

// MARK: - Filters

/// The choices of "Filter item results". Every Processor Freedom item is an item (none is a service), so Item keeps them all;
/// the stock and status rows show an item that matches any of the ones chosen, and the categories one in any chosen category.
struct ItemsFilter: Equatable {
    var item = false
    var out = false
    var low = false
    var hidden = false
    var sale = false
    var cats: Set<String> = []

    var isEmpty: Bool { self == ItemsFilter() }
}

// MARK: - The list

@Observable @MainActor
final class ItemsModel {
    private(set) var items: [CatalogItem] = []
    private(set) var settings = ItemsSettings()
    private(set) var loaded = false
    /// The item settings have been asked for (they arrive just after the list): a new item can start in the right category.
    private(set) var settingsAsked = false
    private(set) var loading = false
    private(set) var problem = ""

    var search = ""
    var searching = false
    var selecting = false
    var selection: Set<String> = []
    /// Kept while the screen is open, like the website keeps its filters while its page is open.
    var filter = ItemsFilter()
    private(set) var toast: String?

    @ObservationIgnored private var round = 0
    /// Counts the lists that changes brought back, so a load that began before one never puts its older list over it.
    @ObservationIgnored private var changes = 0
    @ObservationIgnored private var toastHide: Task<Void, Never>?

    func item(_ id: String) -> CatalogItem? { items.first { $0.id == id } }

    /// The business's categories in the website's order (catNames): the saved category order first when it covers every item's
    /// category, otherwise the items' own order.
    var categoryNames: [String] {
        var itemCats: [String] = []
        for item in items where !itemCats.contains(item.category) { itemCats.append(item.category) }
        let saved = settings.cats
        let ordered = itemCats.allSatisfy({ saved.contains($0) }) ? saved + itemCats : itemCats + saved
        var out: [String] = []
        for name in ordered where !out.contains(name) { out.append(name) }
        return out
    }

    /// A category name as the server will keep it: one that exists in another case is that one ('sides' goes into 'Sides', the
    /// server's canonCategory), so the editor shows the category the item will really be in.
    func canonicalCategory(_ name: String) -> String {
        let wanted = String(name.trimmed.prefix(60)).trimmed
        guard !wanted.isEmpty else { return "" }
        let known = items.map(\.category) + settings.cats
        if let same = known.first(where: { $0 == wanted }) { return same }
        return known.first(where: { $0.lowercased() == wanted.lowercased() }) ?? wanted
    }

    /// The items the list shows: the search words (name and category, or the product code, as the website searches) and the filters.
    var shown: [CatalogItem] {
        let query = search.trimmed.lowercased()
        let filter = self.filter
        let lowAt = settings.lowStockAt
        return items.filter { item in
            if !query.isEmpty && !"\(item.name) \(item.category)".lowercased().contains(query) && !ItemsCodes.hit(item.code, query) { return false }
            return Self.matches(item, filter, lowAt: lowAt)
        }
    }

    private static func matches(_ item: CatalogItem, _ filter: ItemsFilter, lowAt: Int) -> Bool {
        if filter.out || filter.low || filter.hidden || filter.sale {
            // The website's states: hidden first, then sold out at 0, then low at the business's warning level or below.
            let low = item.available && item.stock != 0 && item.stock <= lowAt
            let hit = (filter.out && item.stock == 0) || (filter.low && low) || (filter.hidden && !item.available) || (filter.sale && item.sale > 0)
            if !hit { return false }
        }
        if !filter.cats.isEmpty && !filter.cats.contains(item.category) { return false }
        return true
    }

    // MARK: Loading

    /// The items and the item settings, on appear, on pull to refresh and when a page opened from here closes, so a change made on
    /// the website or another phone shows up.
    func load(_ model: AppModel) async {
        guard let business = model.site else { return }
        round += 1
        let mine = round
        let before = changes
        loading = true
        async let menuAnswer = API.get("/api/sites/\(business.id)/menu")
        async let siteAnswer = API.get("/api/sites/\(business.id)")
        do {
            let menu = try await menuAnswer
            guard mine == round else { return }
            // A change made while this was on its way has already brought back a newer list than this one.
            if before == changes { show(menu) }
            loaded = true
            problem = ""
        } catch let error as APIError {
            guard mine == round else { return }
            // Signed out everywhere, or the session ended: the app checks, then locks. A 403 is only a message.
            if error.status == 401 { model.sessionEnded() }
            problem = error.message
        } catch {
            // Cancelled: the screen went away.
        }
        let site = try? await siteAnswer
        guard mine == round else { return }
        if let site, site["site"].isObject {
            settings = ItemsSettings(site: site["site"])
        }
        // Asked and answered, even with no: without them the editor still works, with the items' own categories.
        if !Task.isCancelled { settingsAsked = true }
        loading = false
    }

    /// The server answers every change with the whole list; it replaces the one shown.
    func take(_ answer: JSON) {
        guard answer["items"].raw is [Any] else { return }
        changes += 1
        show(answer)
    }

    private func show(_ answer: JSON) {
        guard answer["items"].raw is [Any] else { return }
        items = answer["items"].array.compactMap { CatalogItem($0) }
        let ids = Set(items.map(\.id))
        selection = selection.intersection(ids)
        loaded = true
    }

    func showToast(_ text: String) {
        toastHide?.cancel()
        toast = text
        toastHide = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            guard !Task.isCancelled else { return }
            self?.toast = nil
        }
    }

    // MARK: Changes

    /// A change the server made to the items: the Sale screen loads them again the next time it shows.
    func changed(_ model: AppModel) {
        model.shell.order.invalidate()
    }

    /// The website's bulk changes and bulk delete (POST /api/sites/<id>/menu/bulk). Nil when it worked, otherwise the server's words.
    func bulk(_ model: AppModel, ids: [String], body: [String: Any]) async -> String? {
        guard let business = model.site else { return nil }
        var payload = body
        payload["ids"] = ids
        do {
            let answer = try await API.post("/api/sites/\(business.id)/menu/bulk", payload)
            take(answer)
            changed(model)
            return nil
        } catch let error as APIError {
            if error.status == 401 { model.sessionEnded() }
            return error.message
        } catch {
            // Never said to have worked when no answer came.
            return APIError.unreachableMessage
        }
    }

    /// Imports an item list (POST /api/sites/<id>/menu/import), as the website's import does. The number added, or the server's words.
    func importList(_ model: AppModel, csv: String, replace: Bool, startStock: Int) async -> Result<Int, APIError> {
        guard let business = model.site else { return .failure(APIError(status: 0, message: APIError.unreachableMessage)) }
        do {
            let answer = try await API.post("/api/sites/\(business.id)/menu/import", ["csv": csv, "replace": replace, "startStock": startStock])
            take(answer)
            changed(model)
            return .success(max(0, answer["imported"].int))
        } catch let error as APIError {
            if error.status == 401 { model.sessionEnded() }
            return .failure(error)
        } catch {
            return .failure(APIError(status: 0, message: APIError.unreachableMessage))
        }
    }

    // MARK: Export and print

    /// The website's "Download item list" file, written where the share sheet can hand it on: a folder of its own with the app's
    /// other downloads, so it is removed when the sheet closes instead of staying in the temporary folder.
    func exportFile() throws -> URL {
        let name = settings.slug.isEmpty ? "items" : "\(settings.slug)-items"
        let url = try DownloadCenter.newFolder().appendingPathComponent("\(name).csv")
        try ItemsCSV.export(items).write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    /// The item list on paper with AirPrint, laid out as the website prints a list of items.
    func printList() {
        let rows = items.map { item in
            [item.name, item.variable ? "Variable" : Money.decimal(item.price), item.cost.map { Money.decimal($0) } ?? "", "Item", item.stock == 0 ? "No" : "Yes"]
        }
        let html = ItemsCSV.printPage(title: "Items", head: ["Item name", "Price", "Cost", "Item type", "In stock"], rows: rows)
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo.printInfo()
        info.jobName = "Items"
        info.outputType = .general
        controller.printInfo = info
        controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
        _ = controller.present(animated: true, completionHandler: nil)
    }
}

// MARK: - Item colours

/// One of the colours an item can have.
struct ItemColorChoice: Hashable {
    let name: String
    let hex: String
}

/// The colours an item can have: the website's list (CAT_COLORS in public/js/editor.js), which the server keeps as "#rrggbb".
enum ItemColors {
    static let all: [ItemColorChoice] = [
        ItemColorChoice(name: "Red", hex: "#d93f3f"), ItemColorChoice(name: "Orange", hex: "#ef7d32"),
        ItemColorChoice(name: "Yellow", hex: "#e7b416"), ItemColorChoice(name: "Green", hex: "#3d9b5f"),
        ItemColorChoice(name: "Teal", hex: "#1f9aa0"), ItemColorChoice(name: "Blue", hex: "#3b74d6"),
        ItemColorChoice(name: "Indigo", hex: "#5b5bd6"), ItemColorChoice(name: "Purple", hex: "#8e4ec6"),
        ItemColorChoice(name: "Pink", hex: "#c96b9c"), ItemColorChoice(name: "Brown", hex: "#8a5a3c"),
        ItemColorChoice(name: "Grey", hex: "#7d8590"), ItemColorChoice(name: "Black", hex: "#2b2b2b"),
    ]

    /// "None", the colour's name, or the colour itself when it is not one of the list (set some other way).
    static func name(_ hex: String) -> String {
        guard !hex.isEmpty else { return "None" }
        return all.first(where: { $0.hex == hex.lowercased() })?.name ?? hex.uppercased()
    }

    /// The colour of "#rrggbb", or nil for none or anything else.
    static func uiColor(_ hex: String) -> UIColor? {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        return UIColor(hex: value)
    }
}

// MARK: - Product codes in searches

/// Item searches also find an item by its product code, compared the way the website's codeHit does: tidied (spaces, dashes and
/// characters no one can see left out, letters in capitals) as typed, or in the form the scanner compares (ProductCode.normalize).
enum ItemsCodes {
    static func tidy(_ code: String) -> String {
        var kept = String.UnicodeScalarView()
        for scalar in String(code.prefix(200)).unicodeScalars where !removed(scalar) { kept.append(scalar) }
        return String(kept).uppercased()
    }

    static func hit(_ code: String, _ query: String) -> Bool {
        let typed = tidy(query)
        guard !typed.isEmpty, !code.isEmpty else { return false }
        let wanted = ProductCode.normalize(query)
        return tidy(code).contains(typed) || (!wanted.isEmpty && ProductCode.normalize(code).contains(wanted))
    }

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

// MARK: - Prices as the website reads them

enum ItemsMoney {
    /// "$1,234.50", "12", "9,50" or "Free" in cents, or nil when it is not a price (shared/core.js parsePrice).
    static func parse(_ input: String) -> Int? {
        let raw = input.trimmed
        guard !raw.isEmpty else { return nil }
        let lower = raw.lowercased()
        if lower == "free" || lower == "no charge" || lower == "n/c" { return 0 }
        if ItemsRx.negative.test(raw) { return nil }
        var kept = String.UnicodeScalarView()
        for scalar in raw.unicodeScalars where isDigit(scalar) || scalar == "." || scalar == "," { kept.append(scalar) }
        let scalars = Array(kept)
        guard scalars.contains(where: isDigit) else { return nil }
        var text = String(kept)
        if let last = scalars.lastIndex(where: { $0 == "." || $0 == "," }) {
            let decimals = scalars.count - last - 1
            let separators = scalars.filter { $0 == "." || $0 == "," }.count
            // Three digits after a lone dot could be cents typed wrong (1.250), so it is not guessed.
            if decimals == 3 && separators == 1 && scalars[last] == "." { return nil }
            if decimals > 3 { return nil }
            let whole = String(String.UnicodeScalarView(scalars[..<last].filter { $0 != "." && $0 != "," }))
            if decimals >= 1 && decimals <= 2 {
                text = whole + "." + String(String.UnicodeScalarView(scalars[(last + 1)...]))
            } else {
                text = String(String.UnicodeScalarView(scalars.filter { $0 != "." && $0 != "," }))
            }
        }
        guard let value = Double(text) else { return nil }
        let cents = (value * 100).rounded()
        guard cents.isFinite, cents >= 0, cents <= 10_000_000 else { return nil }
        return Int(cents)
    }

    static func isDigit(_ scalar: Unicode.Scalar) -> Bool { scalar.value >= 48 && scalar.value <= 57 }

    /// "Small\nLarge +1.50": one choice per line, a price at the end (shared/core.js parseChoices).
    static func choices(_ text: String) -> [ItemChoice] {
        String(text.prefix(4000)).components(separatedBy: "\n").map { $0.trimmed }.filter { !$0.isEmpty }.map { line in
            if let parts = ItemsRx.choice.groups(line), parts.count == 3, !parts[1].trimmed.isEmpty {
                return ItemChoice(name: parts[1].trimmed, price: parse(parts[2]) ?? 0)
            }
            return ItemChoice(name: line, price: 0)
        }
    }

    /// The choices as the website writes them in its box, one per line (shared/core.js choicesText).
    static func choicesText(_ choices: [ItemChoice]) -> String {
        choices.map { $0.price > 0 ? "\($0.name) +\(Money.decimal($0.price))" : $0.name }.joined(separator: "\n")
    }
}

/// A regular expression that is never a crash: a pattern that does not compile matches nothing.
struct ItemsRx {
    let regex: NSRegularExpression?

    init(_ pattern: String, caseless: Bool = true) {
        regex = try? NSRegularExpression(pattern: pattern, options: caseless ? [.caseInsensitive] : [])
    }

    func test(_ text: String) -> Bool {
        guard let regex else { return false }
        return regex.firstMatch(in: text, options: [], range: NSRange(text.startIndex..., in: text)) != nil
    }

    /// The whole match and each group, or nil without a match.
    func groups(_ text: String) -> [String]? {
        guard let regex, let match = regex.firstMatch(in: text, options: [], range: NSRange(text.startIndex..., in: text)) else { return nil }
        return (0..<match.numberOfRanges).map { index in
            guard let range = Range(match.range(at: index), in: text) else { return "" }
            return String(text[range])
        }
    }

    static let negative = ItemsRx(#"-\s*[0-9]|\(\s*\$?[0-9]"#)
    static let choice = ItemsRx(#"^(.*?)[\s,;:-]*\+?\s*\$?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*$"#)
}

// MARK: - The item list file

/// One row of an item list that would be imported, as much as the import sheet shows of it.
struct ImportedRow: Hashable {
    let name: String
    let category: String
    let price: Int
    let variable: Bool
    let stock: Int?
    let row: Int
}

/// A row that will be skipped, and why.
struct ImportSkip: Hashable {
    let row: Int
    let reason: String
}

struct ImportReading {
    var items: [ImportedRow] = []
    var errors: [ImportSkip] = []
}

/// The website's item list files: what "Download item list" writes, and how an uploaded one is read (shared/core.js parseCsv and
/// parseMenuCsv), so the import sheet says what the server will add.
enum ItemsCSV {
    static func export(_ items: [CatalogItem]) -> String {
        let head = ["Category", "Item name", "Price", "Cost", "Description", "Stock", "Taxable", "Price type", "Product code"]
        let rows = [head] + items.map { item in
            [item.category, item.name, Money.decimal(item.price), item.cost.map { Money.decimal($0) } ?? "", item.desc, String(item.stock),
             item.taxable ? "yes" : "no", item.variable ? "Variable" : "Fixed", item.code]
        }
        let quote: (String) -> String = { "\"" + $0.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
        return "\u{FEFF}" + rows.map { $0.map(quote).joined(separator: ",") }.joined(separator: "\r\n")
    }

    /// The website's printed list: a title and a plain table.
    static func printPage(title: String, head: [String], rows: [[String]]) -> String {
        let escape: (String) -> String = {
            $0.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
        }
        let css = "body{font:14px system-ui,sans-serif;margin:32px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ddd}"
        let header = head.map { "<th>\(escape($0))</th>" }.joined()
        let body = rows.map { row in "<tr>" + row.map { "<td>\(escape($0))</td>" }.joined() + "</tr>" }.joined()
        return "<!doctype html><meta charset=\"utf-8\"><title>\(escape(title))</title><style>\(css)</style><h1>\(escape(title))</h1><table><thead><tr>\(header)</tr></thead><tbody>\(body)</tbody></table>"
    }

    /// A spreadsheet's text in rows of cells: quotes, line breaks inside quotes, and comma, semicolon or tab separators.
    static func rows(_ text: String) -> [[String]] {
        var scalars = Array(text.unicodeScalars)
        if scalars.first == "\u{FEFF}" { scalars.removeFirst() }
        var first = String.UnicodeScalarView()
        for scalar in scalars {
            if scalar == "\n" {
                if first.last == "\r" { first.removeLast() }
                break
            }
            first.append(scalar)
        }
        let count: (Unicode.Scalar) -> Int = { wanted in first.filter { $0 == wanted }.count }
        let separator: Unicode.Scalar = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ","
        var rows: [[String]] = []
        var row: [String] = []
        var cell = String.UnicodeScalarView()
        var quoted = false
        var index = 0
        while index < scalars.count {
            let scalar = scalars[index]
            if quoted {
                if scalar == "\"" {
                    if index + 1 < scalars.count && scalars[index + 1] == "\"" {
                        cell.append("\"")
                        index += 1
                    } else {
                        quoted = false
                    }
                } else {
                    cell.append(scalar)
                }
            } else if scalar == "\"" && String(cell).trimmed.isEmpty {
                cell = String.UnicodeScalarView()
                quoted = true
            } else if scalar == separator {
                row.append(String(cell))
                cell = String.UnicodeScalarView()
            } else if scalar == "\n" || scalar == "\r" {
                if scalar == "\r" && index + 1 < scalars.count && scalars[index + 1] == "\n" { index += 1 }
                row.append(String(cell))
                rows.append(row)
                row = []
                cell = String.UnicodeScalarView()
            } else {
                cell.append(scalar)
            }
            index += 1
        }
        if !cell.isEmpty || !row.isEmpty {
            row.append(String(cell))
            rows.append(row)
        }
        return rows.map { $0.map { $0.trimmed } }.filter { $0.contains { !$0.isEmpty } }
    }

    // The column names the website recognises, in its order (a "Price type" column is never read as the price).
    private static let codeNames = #"(product\s*codes?|item\s*codes?|bar\s*codes?|upcs?|eans?|gtins?|isbns?|skus?|plus?)"#
    private static let codeVariant = #"([\s_-]?([ae]|\d{1,2}))?"#
    private static func codeColumn(_ first: String) -> ItemsRx {
        ItemsRx("^" + first + codeVariant + #"([\s_/-]*("# + codeNames + codeVariant + #"|codes?|numbers?|nums?\.?|nos?\.?|nr\.?|#|ids?|values?|or|and|&))*(\s*(\([^)]*\)|\[[^\]]*\]))?[\s.:*]*$"#)
    }

    private static let columns: [(key: String, rx: ItemsRx)] = [
        ("category", ItemsRx(#"^(menu\s*)?(categor(y|ies)|section|group|department|type)$"#)),
        ("name", ItemsRx(#"^((item|product|menu\s*item|dish)(\s*name)?|name|title)$"#)),
        ("cost", ItemsRx(#"^(unit\s*|item\s*)?cost$"#)),
        ("variable", ItemsRx(#"^(price\s*(type|kind|mode)|pricing\s*(type|strategy|method))$"#)),
        ("code", codeColumn(#"(product\s*codes?|bar\s*codes?|upcs?|eans?|gtins?)"#)),
        ("sku", codeColumn(#"(skus?|plus?|item\s*codes?)"#)),
        ("price", ItemsRx(#"price|cost|amount|^\$$"#)),
        ("desc", ItemsRx(#"desc|details|notes?$"#)),
        ("stock", ItemsRx(#"stock|qty|quantity|inventory|on\s*hand|count"#)),
        ("image", ItemsRx(#"image|photo|picture|img"#)),
        ("available", ItemsRx(#"availab|active|enabled|in\s*stock|visible"#)),
        ("taxable", ItemsRx(#"tax"#)),
    ]
    private static let variablePrice = ItemsRx(#"^(variable|open|manual|market)(\s*price)?$"#)
    private static let lostDigits = ItemsRx(#"^[0-9](\.[0-9]+)?e\+[0-9]{1,2}$"#)
    private static let gtinName = ItemsRx(#"(^|[^a-z])(upc|ean|gtin)"#)
    private static let threeLetters = ItemsRx(#"[a-z]{3,}"#)
    private static let wholeStock = ItemsRx(#"^[0-9]{1,6}$"#, caseless: false)

    private static func hasDigit(_ text: String) -> Bool { text.unicodeScalars.contains(where: ItemsMoney.isDigit) }

    /// An uploaded item list read the way the server will read it: the items it will add and the rows it will skip.
    static func read(_ text: String) -> ImportReading {
        let rows = rows(text)
        var out = ImportReading()
        guard let head = rows.first else {
            out.errors.append(ImportSkip(row: 0, reason: "The file is empty."))
            return out
        }
        var map: [String: Int] = [:]
        for (index, name) in head.enumerated() {
            if let hit = columns.first(where: { map[$0.key] == nil && $0.rx.test(name) }) { map[hit.key] = index }
        }
        if map["price"] == nil, let cost = map["cost"] {
            map["price"] = cost
            map["cost"] = nil
        }
        var body = Array(rows.dropFirst())
        var offset = 2
        if map["name"] == nil || map["price"] == nil {
            // No header row: work out which column holds prices from the data itself.
            let width = rows.map(\.count).max() ?? 0
            let score: (Int) -> Int = { column in
                rows.filter { row in
                    let value = column < row.count ? row[column] : ""
                    return hasDigit(value) && ItemsMoney.parse(value) != nil && !threeLetters.test(value)
                }.count
            }
            var priceColumn = -1
            if width > 1 {
                for column in 1..<width {
                    let points = score(column)
                    if Double(points) >= Double(rows.count) * 0.6 && (priceColumn < 0 || points > score(priceColumn)) { priceColumn = column }
                }
            }
            guard priceColumn >= 0 else {
                out.errors.append(ImportSkip(row: 1, reason: "We could not find a column of item names and a column of prices. Download the template to see the layout."))
                return out
            }
            map = ["name": priceColumn - 1, "price": priceColumn]
            if priceColumn >= 2 { map["category"] = priceColumn - 2 }
            if priceColumn + 1 < width { map["desc"] = priceColumn + 1 }
            let top = priceColumn < head.count ? head[priceColumn] : ""
            let firstIsHeader = ItemsMoney.parse(top) == nil || !hasDigit(top)
            body = firstIsHeader ? Array(rows.dropFirst()) : rows
            offset = firstIsHeader ? 2 : 1
        }
        let get: ([String], String) -> String = { row, key in
            guard let column = map[key], column >= 0, column < row.count else { return "" }
            return String(row[column].prefix(2000)).trimmed
        }
        var category = ""
        var codes: [String: String] = [:]
        let gtinColumn = map["code"].map { $0 < head.count && gtinName.test(head[$0]) } ?? false
        for (index, row) in body.enumerated() {
            let number = index + offset
            let name = get(row, "name")
            let priceText = get(row, "price")
            let rowCategory = get(row, "category")
            if !rowCategory.isEmpty { category = String(rowCategory.prefix(60)) }
            if name.isEmpty && priceText.isEmpty { continue }
            if name.isEmpty {
                out.errors.append(ImportSkip(row: number, reason: "Missing item name."))
                continue
            }
            let variable = variablePrice.test(get(row, "variable")) || variablePrice.test(priceText)
            let parsed = variable ? (ItemsMoney.parse(priceText) ?? 0) : ItemsMoney.parse(priceText)
            guard let price = parsed else {
                out.errors.append(ImportSkip(row: number, reason: priceText.isEmpty ? "No price for “\(name.prefix(40))”." : "“\(priceText.prefix(20))” is not a price."))
                continue
            }
            let fromCode = get(row, "code")
            let codeText = fromCode.isEmpty ? get(row, "sku") : fromCode
            if lostDigits.test(codeText) {
                out.errors.append(ImportSkip(row: number, reason: "Product code \(codeText.prefix(20)) lost its digits in the spreadsheet. Format that column as text and save the file again."))
                continue
            }
            let code = zeroBack(cleanCode(codeText), gtin: !fromCode.isEmpty && gtinColumn)
            let key = ProductCode.normalize(code)
            if !key.isEmpty, let owner = codes[key] {
                out.errors.append(ImportSkip(row: number, reason: "Product code \(code) is already used by “\(owner.prefix(40))”."))
                continue
            }
            if out.items.count >= 1000 {
                out.errors.append(ImportSkip(row: number, reason: "Only the first 1,000 items are imported."))
                continue
            }
            if !key.isEmpty { codes[key] = name }
            let stockText = get(row, "stock")
            out.items.append(ImportedRow(name: String(name.prefix(120)), category: category.isEmpty ? "Menu" : category, price: price, variable: variable,
                                         stock: wholeStock.test(stockText) ? Int(stockText) : nil, row: number))
        }
        if out.items.isEmpty && out.errors.isEmpty { out.errors.append(ImportSkip(row: 0, reason: "No items were found in the file.")) }
        return out
    }

    /// A product code as the server keeps it (shared/core.js cleanCode).
    static func cleanCode(_ input: String) -> String {
        var kept = String.UnicodeScalarView()
        for scalar in String(input.prefix(200)).unicodeScalars {
            let kind = scalar.properties.generalCategory
            if kind != .control && kind != .format { kept.append(scalar) }
        }
        let code = String(String(kept).trimmed.prefix(64)).trimmed
        return ProductCode.normalize(code).isEmpty ? "" : code
    }

    /// A barcode a spreadsheet took for a number lost its first 0; it is put back when that makes it a valid barcode (zeroBack).
    private static func zeroBack(_ code: String, gtin: Bool) -> String {
        guard !code.isEmpty, code.unicodeScalars.allSatisfy(ItemsMoney.isDigit) else { return code }
        let length = code.unicodeScalars.count
        if length == 11 && gs1Ok("0" + code) { return "0" + code }
        if gtin && length == 7 && (gs1Ok("0" + code) || gs1Ok(upcA("0" + code))) { return "0" + code }
        return code
    }

    private static func gs1Ok(_ digits: String) -> Bool {
        var sum = 0
        for (index, scalar) in digits.unicodeScalars.reversed().enumerated() {
            sum += (Int(scalar.value) - 48) * (index % 2 == 1 ? 3 : 1)
        }
        return sum % 10 == 0
    }

    private static func upcA(_ upcE: String) -> String {
        let d = Array(upcE)
        guard d.count == 8 else { return upcE }
        let middle: String
        if d[6] <= "2" {
            middle = "\(d[1])\(d[2])\(d[6])0000\(d[3])\(d[4])\(d[5])"
        } else if d[6] == "3" {
            middle = "\(d[1])\(d[2])\(d[3])00000\(d[4])\(d[5])"
        } else if d[6] == "4" {
            middle = "\(d[1])\(d[2])\(d[3])\(d[4])00000\(d[5])"
        } else {
            middle = "\(d[1])\(d[2])\(d[3])\(d[4])\(d[5])0000\(d[6])"
        }
        return "\(d[0])\(middle)\(d[7])"
    }
}

// MARK: - Item photos

/// An item photo chosen on the phone, prepared and uploaded the way the website's uploadImage does it: cropped to the item photo's
/// 4:3 shape in the middle, at most 1,400 pixels across, a PNG kept as a PNG and anything else saved as a JPEG, then sent to
/// POST /api/uploads, which answers with the photo's address.
enum ItemPhoto {
    static func prepare(_ data: Data) throws -> (data: Data, type: String) {
        // The website leaves GIFs as they are.
        if data.starts(with: [0x47, 0x49, 0x46]) {
            guard data.count <= 8 * 1024 * 1024 else { throw APIError(status: 413, message: "That image is too large. Try one under 8 MB.") }
            return (data, "image/gif")
        }
        guard let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 else {
            throw APIError(status: 415, message: "Choose an image file.")
        }
        let png = data.starts(with: [0x89, 0x50, 0x4E, 0x47])
        // In pixels, the right way up.
        let full = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let ratio: CGFloat = 4.0 / 3.0
        var crop = full
        if full.width / full.height > ratio { crop.width = (full.height * ratio).rounded() } else { crop.height = (full.width / ratio).rounded() }
        let scale = min(1, 1400 / max(crop.width, crop.height))
        let target = CGSize(width: max(1, (crop.width * scale).rounded()), height: max(1, (crop.height * scale).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = !png
        let drawn = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            let ratioX = target.width / crop.width
            let ratioY = target.height / crop.height
            let origin = CGPoint(x: -((full.width - crop.width) / 2) * ratioX, y: -((full.height - crop.height) / 2) * ratioY)
            image.draw(in: CGRect(origin: origin, size: CGSize(width: full.width * ratioX, height: full.height * ratioY)))
        }
        guard let out = png ? drawn.pngData() : drawn.jpegData(compressionQuality: 0.86) else { throw APIError(status: 415, message: "Choose an image file.") }
        guard out.count <= 8 * 1024 * 1024 else { throw APIError(status: 413, message: "That image is too large. Try one under 8 MB.") }
        return (out, png ? "image/png" : "image/jpeg")
    }

    /// Sends a prepared photo and gives back its address on our server ("/u/…").
    static func upload(_ data: Data, type: String) async throws -> String {
        var request = URLRequest(url: Config.url("/api/uploads"))
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue(type, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let result: (Data, URLResponse)
        do {
            result = try await URLSession.shared.upload(for: request, from: data)
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            // "You're offline" only when the phone has no connection, as for every other request (API.words).
            let offline: Set<URLError.Code> = [.notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff]
            let code = (error as? URLError)?.code
            throw APIError(status: 0, message: code.map { offline.contains($0) } == true ? APIError.offlineMessage : APIError.unreachableMessage)
        }
        let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
        let json = JSON(data: result.0)
        if (200..<300).contains(status), !json["url"].string.isEmpty { return json["url"].string }
        let text = json["error"].string
        // Only a gateway's answer means the service is restarting; the service's own words ("Uploads are not available.") are shown.
        if text.isEmpty, status == 502 || status == 503 || status == 504 { throw APIError(status: status, message: APIError.restartingMessage) }
        throw APIError(status: status, message: text.isEmpty ? "Something went wrong. Please try again." : text, data: json)
    }
}
