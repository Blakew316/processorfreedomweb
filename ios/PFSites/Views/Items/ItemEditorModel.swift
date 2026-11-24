import Foundation
import Observation

/// One of an item's own options as the editor shows it. The choices stay exactly as the server has them (hidden online, sold out)
/// until the person edits their text; then they are read from the text the way the website reads its box.
struct ItemOptionDraft: Identifiable, Equatable {
    let id: UUID
    var name: String
    var required: Bool
    var multi: Bool
    var choicesText: String
    let kept: [ItemChoice]
    let keptText: String

    init(name: String, required: Bool, multi: Bool, choices: [ItemChoice] = []) {
        id = UUID()
        self.name = name
        self.required = required
        self.multi = multi
        kept = choices
        keptText = ItemsMoney.choicesText(choices)
        choicesText = keptText
    }

    var body: [String: Any] {
        let choices = choicesText == keptText ? kept : ItemsMoney.choices(choicesText)
        return ["name": name, "required": required, "multi": multi, "choices": choices.map(\.body)]
    }
}

/// Everything the item editor edits, as typed. Comparing it with how it started tells whether anything changed.
struct ItemDraft: Equatable {
    var name = ""
    var category = ""
    var color = ""
    var variable = false
    var priceText = ""
    var costText = ""
    var desc = ""
    var image = ""
    var available = true
    var taxable = true
    var stockText = "100"      // the server's starting quantity for a new item (DEFAULT_STOCK)
    var restockText = ""
    var saleText = ""
    var mods: [String] = []
    var label = ""
    var revclass = ""
    var options: [ItemOptionDraft] = []
    var code = ""

    init() {}

    init(_ item: CatalogItem) {
        name = item.name
        category = item.category
        color = item.color
        variable = item.variable
        // A variable price has no price box; the price it had is kept for if it goes back to a fixed price.
        priceText = item.variable && item.price == 0 ? "" : Money.decimal(item.price)
        costText = item.cost.map { Money.decimal($0) } ?? ""
        desc = item.desc
        image = item.image
        available = item.available
        taxable = item.taxable
        stockText = String(item.stock)
        restockText = item.restock.map { String($0) } ?? ""
        saleText = item.sale > 0 ? String(item.sale) : ""
        mods = item.mods
        label = item.label
        revclass = item.revclass
        options = item.options.map { ItemOptionDraft(name: $0.name, required: $0.required, multi: $0.multi, choices: $0.choices) }
        code = item.code
    }

    var stock: Int { max(0, min(999_999, Int(stockText) ?? 0)) }
    var restock: Int? { restockText.isEmpty ? nil : max(0, min(999_999, Int(restockText) ?? 0)) }
    var sale: Int { max(0, min(90, Int(saleText) ?? 0)) }
}

/// The item editor of Items and services, for an item that exists (saved with the website's PUT, with the stock it last saw so a
/// sale made meanwhile is never undone) or a new one (nothing is created until Save, which sends it to POST …/menu).
@Observable @MainActor
final class ItemEditorModel {
    private(set) var itemID: String?
    private(set) var original: CatalogItem?
    var draft: ItemDraft
    private(set) var start: ItemDraft
    /// The stock count this editor last saw (the website's stockWas).
    private(set) var seenStock: Int
    /// An item that was opened but is no longer on the list (deleted on the website or another phone).
    let missing: Bool

    var nameProblem = ""
    var priceProblem = ""
    var costProblem = ""
    var codeProblem = ""
    var stockProblem = ""
    private(set) var saving = false
    private(set) var uploading = false

    init(item: CatalogItem?, opened id: String?, newCategory: String) {
        itemID = item?.id
        original = item
        missing = id != nil && item == nil
        var first = item.map { ItemDraft($0) } ?? ItemDraft()
        if item == nil { first.category = newCategory }
        draft = first
        start = first
        seenStock = item?.stock ?? 100
    }

    var isNew: Bool { itemID == nil }
    var changed: Bool { draft != start }
    /// The item's name as it is saved, or the website's words for an item not made yet.
    var heading: String {
        guard let name = original?.name.trimmed, !name.isEmpty else { return "New item" }
        return name
    }

    // MARK: Saving

    /// What Save sends: the website's item body. Nil when a field holds something the server would refuse; the field says why.
    private func body() -> [String: Any]? {
        nameProblem = ""
        priceProblem = ""
        costProblem = ""
        codeProblem = ""
        stockProblem = ""
        var ok = true
        if draft.name.trimmed.isEmpty {
            nameProblem = "Give the item a name."
            ok = false
        }
        let typedPrice = ItemsMoney.parse(draft.priceText)
        if !draft.variable && typedPrice == nil {
            priceProblem = "Enter a price like 9.99."
            ok = false
        }
        var cost: Int? = nil
        if !draft.costText.trimmed.isEmpty {
            cost = ItemsMoney.parse(draft.costText)
            if cost == nil {
                costProblem = "Enter a price like 9.99."
                ok = false
            }
        }
        guard ok else { return nil }
        let price = typedPrice ?? (original?.price ?? 0)
        var body: [String: Any] = [
            "name": draft.name,
            "category": draft.category,
            "price": price,
            "variable": draft.variable,
            "desc": draft.desc,
            "image": draft.image,
            "available": draft.available,
            "taxable": draft.taxable,
            "stock": draft.stock,
            "sale": draft.sale,
            "mods": draft.mods,
            "label": draft.label,
            "revclass": draft.revclass,
            "options": draft.options.map(\.body),
            "code": draft.code,
        ]
        body["cost"] = cost.map { $0 as Any } ?? NSNull()
        body["restock"] = draft.restock.map { $0 as Any } ?? NSNull()
        return body
    }

    /// Saves the item. True when everything was saved; otherwise what went wrong is shown by the field it is about, or returned
    /// for a message when it is about none of them.
    func save(_ model: AppModel, items: ItemsModel) async -> (saved: Bool, message: String?) {
        guard !saving, let business = model.site else { return (false, nil) }
        guard var payload = body() else { return (false, nil) }
        saving = true
        defer { saving = false }
        let before = Set(items.items.map(\.id))
        let wantedColor = draft.color
        let colorChanged = wantedColor != start.color
        do {
            let answer: JSON
            if let id = itemID {
                payload["stockWas"] = seenStock
                answer = try await API.send("PUT", "/api/sites/\(business.id)/menu/\(id)", body: payload)
            } else {
                answer = try await API.post("/api/sites/\(business.id)/menu", payload)
            }
            items.take(answer)
            items.changed(model)
            // From here on this editor is for the saved item, so trying again never sends an old stock count or a second new item.
            let madeID = answer["items"].array.map { $0["id"].string }.first(where: { !$0.isEmpty && !before.contains($0) })
            let savedID = itemID ?? madeID
            if let savedID, let fresh = items.item(savedID) {
                itemID = savedID
                original = fresh
                seenStock = fresh.stock
                var saved = ItemDraft(fresh)
                // The colour is only kept by the bulk route; until it has been sent it stays a change.
                saved.color = start.color
                start = saved
                draft = ItemDraft(fresh)
                draft.color = wantedColor
            }
            if colorChanged, let savedID {
                if let problem = await items.bulk(model, ids: [savedID], body: ["set": ["color": wantedColor]]) {
                    return (false, problem)
                }
                start.color = wantedColor
            }
            return (true, nil)
        } catch let error as APIError {
            if error.status == 401 { model.sessionEnded() }
            // Sold while the editor was open: the real count shows, and the person's other changes stay to be saved.
            if error.status == 409 && error.data["stock"].exists {
                let real = max(0, error.data["stock"].int)
                seenStock = real
                draft.stockText = String(real)
                stockProblem = error.message
                return (false, nil)
            }
            return (false, place(error.message))
        } catch {
            return (false, nil)
        }
    }

    /// Puts the server's words by the field they are about, as the website does. Words about no field are given back.
    private func place(_ message: String) -> String? {
        let lower = message.lowercased()
        if lower.contains("product code") {
            codeProblem = message
        } else if lower.contains("price") && !draft.variable {
            priceProblem = message
        } else if lower.contains("give the item a name") {
            nameProblem = message
        } else {
            return message
        }
        return nil
    }

    /// Deletes the item. Nil when it is gone, otherwise the server's words.
    func delete(_ model: AppModel, items: ItemsModel) async -> String? {
        guard let id = itemID, let business = model.site else { return nil }
        do {
            let answer = try await API.delete("/api/sites/\(business.id)/menu/\(id)")
            items.take(answer)
            items.changed(model)
            return nil
        } catch let error as APIError {
            if error.status == 401 { model.sessionEnded() }
            return error.message
        } catch {
            return APIError.unreachableMessage
        }
    }

    // MARK: Photo

    /// A photo chosen for the item: prepared and uploaded the way the website does, then shown in the box. Nil when it worked.
    func setPhoto(_ data: Data, model: AppModel) async -> String? {
        uploading = true
        defer { uploading = false }
        do {
            let prepared = try await Task.detached(priority: .userInitiated) { try ItemPhoto.prepare(data) }.value
            draft.image = try await ItemPhoto.upload(prepared.data, type: prepared.type)
            return nil
        } catch let error as APIError {
            if error.status == 401 { model.sessionEnded() }
            return error.message
        } catch is CancellationError {
            return nil
        } catch {
            return "Something went wrong. Please try again."
        }
    }

    // MARK: Price type

    /// Fixed or variable, as the website switches it: a variable price has no price box and no sale; going back to a fixed price
    /// shows the price it had, or an empty box when it never had one.
    func setVariable(_ on: Bool) {
        guard draft.variable != on else { return }
        draft.variable = on
        priceProblem = ""
        if !on && (ItemsMoney.parse(draft.priceText) ?? 0) <= 0 {
            // Sent as 0.00 it would make the item free: the box starts empty, and Save asks for a price.
            draft.priceText = ""
        }
    }
}
