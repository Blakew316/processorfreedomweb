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

    var nameProblem = ""
    var priceProblem = ""
    var costProblem = ""
    var codeProblem = ""
    var stockProblem = ""
    private(set) var saving = false
    private(set) var uploading = false

    /// `newCategory` is where a new item goes unless the person picks another: the website's Add item puts it in the business's
    /// last category (catNames), or "Menu" when there is none, so the Categories card shows where it will really be.
    init(item: CatalogItem?, newCategory: String = "") {
        itemID = item?.id
        original = item
        var first = item.map { ItemDraft($0) } ?? ItemDraft()
        if item == nil {
            first.category = newCategory
        }
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

    /// The first field, from the top of the page, that says why the last save was refused.
    var firstProblem: ItemEditorField? {
        if !nameProblem.isEmpty { return .name }
        if !priceProblem.isEmpty { return .price }
        if !costProblem.isEmpty { return .cost }
        if !codeProblem.isEmpty { return .code }
        if !stockProblem.isEmpty { return .stock }
        return nil
    }

    /// That field's message, for VoiceOver to say when a save is refused.
    var firstProblemText: String {
        [nameProblem, priceProblem, costProblem, codeProblem, stockProblem].first { !$0.isEmpty } ?? ""
    }

    /// What customers pay while a sale is on, in the website's words (or how to have no sale).
    var saleLine: String {
        guard draft.sale > 0, let price = ItemsMoney.parse(draft.priceText) else { return "Leave empty for no sale." }
        let paid = Int((Double(price * (100 - min(90, draft.sale))) / 100).rounded())
        return "Customers pay \(Money.format(paid)) while the sale is on."
    }

    // MARK: Editing

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

    /// An item has exactly one category: the one chosen replaces the one it had.
    func chooseCategory(_ name: String) {
        draft.category = name
    }

    /// The item settings (the saved order of the categories) arrived after a new item was opened: it starts in the category
    /// the website's Add item would put it in, unless the person has already chosen another.
    func startCategory(_ name: String) {
        guard isNew, draft.category == start.category, name != start.category else { return }
        start.category = name
        draft.category = name
    }

    /// Taken off: saved like that, the server puts the item in its default category ("Menu").
    func removeCategory() {
        draft.category = ""
    }

    /// One more or one fewer in stock, as the website's − and + do.
    func bumpStock(_ by: Int) {
        draft.stockText = String(max(0, min(999_999, draft.stock + by)))
        stockProblem = ""
    }

    /// The website's new option: sizes first (one must be chosen), then add-ons (several may be).
    func addOption() {
        let first = draft.options.isEmpty
        draft.options.append(ItemOptionDraft(name: first ? "Size" : "Add-ons", required: first, multi: !first))
    }

    func removeOption(_ id: UUID) {
        draft.options.removeAll { $0.id == id }
    }

    func toggleMod(_ id: String) {
        if draft.mods.contains(id) {
            draft.mods.removeAll { $0 == id }
        } else {
            draft.mods.append(id)
        }
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

    /// Saves the item. True when everything was saved; otherwise what went wrong is shown by the field it is about, or given back
    /// for a message when it is about none of them.
    func save(_ model: AppModel, items: ItemsModel) async -> (saved: Bool, message: String?) {
        guard !saving, model.site != nil else { return (false, nil) }
        saving = true
        defer { saving = false }
        // A new item sent a moment ago got no answer, and the list could not be read then: it is looked for now, before
        // anything is sent again. Without the list nothing is sent, so the item is never made a second time unseen.
        if itemID == nil, let pending = unanswered {
            guard await items.reread(model) else { return (false, ItemsModel.notChecked) }
            unanswered = nil
            adoptMade(pending, items: items)
        }
        return await send(model, items: items)
    }

    /// A new item that was sent and got no answer, for when the list could not be read straight afterwards: the items there
    /// were before it, and its name.
    @ObservationIgnored private var unanswered: (known: Set<String>, name: String)?

    private func send(_ model: AppModel, items: ItemsModel) async -> (saved: Bool, message: String?) {
        guard let business = model.site else { return (false, nil) }
        guard var payload = body() else { return (false, nil) }
        let wanted = draft
        // The items there were before a new one was sent, to find it again if its answer never comes.
        var known: Set<String>?
        do {
            let savedID: String
            if let id = itemID {
                payload["stockWas"] = seenStock
                let answer = try await API.send("PUT", "/api/sites/\(business.id)/menu/\(id)", body: payload)
                items.take(answer)
                savedID = id
            } else {
                let before = Set(items.items.map(\.id))
                known = before
                let answer = try await API.post("/api/sites/\(business.id)/menu", payload)
                items.take(answer)
                // The new item is the one the list did not have; the server adds it at the end.
                let made = answer["items"].array.map { $0["id"].string }.filter { !$0.isEmpty }
                guard let id = made.last(where: { !before.contains($0) }) ?? made.last else { return (true, nil) }
                savedID = id
                adopt(id, items: items, keepDraft: true)
                // A new item is made without modifier groups, a printer label or a revenue class (the server's insertItems), so
                // they follow with the website's PUT of the whole item, which leaves the stock it was just given as it is.
                if !wanted.mods.isEmpty || !wanted.label.isEmpty || !wanted.revclass.isEmpty {
                    payload["stock"] = seenStock
                    payload["stockWas"] = seenStock
                    let again = try await API.send("PUT", "/api/sites/\(business.id)/menu/\(id)", body: payload)
                    items.take(again)
                }
            }
            items.changed(model)
            adopt(savedID, items: items, keepDraft: true)
            // The colour is kept only by the website's bulk change; until it has been sent it stays a change to save.
            if wanted.color != (items.item(savedID)?.color ?? "") {
                if let problem = await items.bulk(model, ids: [savedID], body: ["set": ["color": wanted.color]]) {
                    return (false, problem)
                }
            }
            adopt(savedID, items: items, keepDraft: false)
            return (true, nil)
        } catch let error as APIError {
            if error.status == 401 { model.sessionEnded() }
            // Sold while the editor was open: the real count shows, and the person's other changes stay to be saved.
            if error.status == 409 && error.data["stock"].exists {
                let real = max(0, error.data["stock"].int)
                seenStock = real
                draft.stockText = String(real)
                start.stockText = String(real)
                stockProblem = error.message
                return (false, nil)
            }
            // A new item was sent and no answer came: it may have been made all the same. The list is read again (briefly).
            if error.status == 0, itemID == nil, let known {
                let pending = (known: known, name: wanted.name.trimmed)
                if await items.reread(model) {
                    // It is there: the rest of the save (modifier groups, a label, the colour) goes on from that item, and
                    // the page closes on "Item added" as if the answer had come.
                    if adoptMade(pending, items: items) { return await send(model, items: items) }
                } else {
                    // Not known yet: the next Save looks before it sends anything.
                    unanswered = pending
                }
            }
            return (false, place(error.message))
        } catch {
            return (false, nil)
        }
    }

    /// An item that is in the list now, was not before the save, and has the name that was sent is the one this page made:
    /// from here on Save changes that item instead of making a second copy of it. False when there is no such item, or more
    /// than one.
    @discardableResult
    private func adoptMade(_ pending: (known: Set<String>, name: String), items: ItemsModel) -> Bool {
        let made = items.items.filter { !pending.known.contains($0.id) && $0.name == pending.name }
        guard made.count == 1, let item = made.first else { return false }
        adopt(item.id, items: items, keepDraft: true)
        return itemID == item.id
    }

    /// From here on this editor is for the saved item, so trying again never sends an old stock count or a second new item. With
    /// `keepDraft` the person's own values stay on screen (a later step may still fail); otherwise the server's cleaned values show.
    private func adopt(_ id: String, items: ItemsModel, keepDraft: Bool) {
        guard let fresh = items.item(id) else { return }
        itemID = id
        original = fresh
        seenStock = fresh.stock
        start = ItemDraft(fresh)
        if keepDraft {
            draft.stockText = String(fresh.stock)
        } else {
            draft = start
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
}
