import Foundation

/// The signed-in person, as the server describes them.
struct User: Equatable {
    var id = ""
    var email = ""
    var name = ""
    var phone = ""
    var admin = false
    var twoFactor = false
    var textCodes = false

    init() {}

    init?(_ json: JSON) {
        guard json.isObject, !json["id"].string.isEmpty else { return nil }
        id = json["id"].string
        email = json["email"].string
        name = json["name"].string
        phone = json["phone"].string
        admin = json["admin"].bool
        twoFactor = json["twoFactor"].bool
        textCodes = json["textCodes"].bool
    }

    /// "Blake" from "Blake Woodruff", or the part of the email before the @ when there is no name.
    static func firstName(name: String, email: String) -> String {
        if let first = name.trimmed.split(separator: " ").first, !first.isEmpty { return String(first) }
        return email.split(separator: "@").first.map(String.init) ?? ""
    }
}

/// A business the person can open.
struct Site: Identifiable, Hashable {
    var id: String
    var name: String
    var role: String
    var url: String
    var street: String
    var live: Bool
    var newOrders: Int

    init?(_ json: JSON) {
        let id = json["id"].string
        guard !id.isEmpty else { return nil }
        self.id = id
        name = json["name"].string
        role = json["role"].string
        url = json["url"].string
        street = json["street"].string
        live = json["live"].bool
        newOrders = max(0, json["newOrders"].int)
    }

    var isOwner: Bool { role == "owner" }
    var isKitchen: Bool { role == "kitchen" }
    var roleName: String { role == "owner" ? "Owner" : role == "manager" ? "Manager" : "Employee" }

    /// The address shown under the name in the location list: the street the owner typed, or the web address when there is none.
    var placeLine: String {
        if !street.trimmed.isEmpty { return street }
        return url.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    var ref: SiteRef { SiteRef(id: id, name: name) }
}

/// Just enough about a business to name it on the passcode screen.
struct SiteRef: Hashable {
    var id: String
    var name: String
}

/// What the server can do right now.
struct AppConfig: Equatable {
    var smsEnabled = false
    var appPush = false
}

/// One page of a back-office section, as the website lists it (the page strip, the More list).
struct PageLink: Identifiable, Hashable {
    let id: String
    let label: String
}

/// An item on the Sale screen.
struct MenuItem: Identifiable, Hashable {
    var id: String
    var name: String
    var category: String
    var price: Int        // cents, after the item's sale percentage, the way the website prices it
    var available: Bool
    var stock: Int
    var variable: Bool    // priced at the counter: the amount is keyed in each time

    init?(_ json: JSON) {
        let id = json["id"].string
        guard !id.isEmpty else { return nil }
        self.id = id
        name = json["name"].string
        category = json["category"].string.trimmed.isEmpty ? "Menu" : json["category"].string
        let list = max(0, json["price"].int)
        let sale = min(90, max(0, json["sale"].int))
        price = sale > 0 ? Int((Double(list) * Double(100 - sale) / 100).rounded()) : list
        available = json["available"].exists ? json["available"].bool : true
        stock = json["stock"].exists ? json["stock"].int : 1
        variable = json["variable"].bool
    }

    var soldOut: Bool { !available || stock <= 0 }
}
