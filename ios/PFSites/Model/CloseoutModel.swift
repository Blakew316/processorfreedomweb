import Foundation
import Observation

/// One tender of a batch (Cash, Card, Gift card, ...), as the server's `tally` adds it up (server/app.js): how many payments
/// (a payment taken back counts as minus one), what they came to, and what was refunded by that tender.
struct CloseoutTender: Hashable {
    let method: String
    let count: Int
    let amount: Int
    let refunds: Int

    init(_ json: JSON) {
        method = json["method"].string
        count = json["count"].int
        amount = json["amount"].int
        refunds = json["refunds"].int
    }

    /// What the tender came to less what it gave back, as the website's batch lines show it (`x.amount - (x.refunds || 0)`).
    var net: Int { amount - refunds }
}

/// The money of a batch: the sums of `tally` (payments, count, refunds, refundCount, net), the tenders, and the cash put in and
/// taken out of the drawer. The open batch keeps the tenders and the cash beside `totals`; a closed batch keeps them inside it
/// (very old closed batches may have none, which reads as no tenders and no cash).
struct CloseoutTotals: Hashable {
    let payments: Int
    let count: Int
    let refunds: Int
    let refundCount: Int
    let net: Int
    let tenders: [CloseoutTender]
    let paidIn: Int
    let paidOut: Int

    init(totals: JSON, extras: JSON) {
        payments = totals["payments"].int
        count = totals["count"].int
        refunds = totals["refunds"].int
        refundCount = totals["refundCount"].int
        net = totals["net"].int
        tenders = extras["tenders"].array.map { CloseoutTender($0) }
        paidIn = extras["paidIn"].int
        paidOut = extras["paidOut"].int
    }

    /// Nothing recorded since the last closeout: no payments, no refunds, no cash in or out. The website turns "Close out batch"
    /// off then, and the server answers "There is nothing in the open batch to close out."
    var isEmpty: Bool { count == 0 && refundCount == 0 && paidIn == 0 && paidOut == 0 }
}

/// The open batch: everything recorded since the last closeout (server/app.js `openBatch`).
struct CloseoutOpenBatch: Hashable {
    let number: Int
    /// When the last closeout happened; nil before the business's first one (the website's "Since you started").
    let since: Date?
    let totals: CloseoutTotals

    init(_ json: JSON) {
        number = json["number"].int
        let ms = json["since"].int
        since = ms > 0 ? Date(timeIntervalSince1970: Double(ms) / 1000) : nil
        totals = CloseoutTotals(totals: json["totals"], extras: json)
    }
}

/// A batch that was closed out, as `GET /api/sites/<id>/closeouts` lists it in `history` (the latest 200, newest first).
struct CloseoutBatch: Identifiable, Hashable {
    let id: String
    let number: Int
    let closedAt: Date
    /// The name the person who closed it goes by at this business; empty for very old batches.
    let by: String
    let totals: CloseoutTotals

    init?(_ json: JSON) {
        let id = json["id"].string
        guard !id.isEmpty else { return nil }
        self.id = id
        number = json["number"].int
        closedAt = Date(timeIntervalSince1970: Double(json["createdAt"].int) / 1000)
        by = json["by"].string.trimmed
        totals = CloseoutTotals(totals: json["totals"], extras: json["totals"])
    }

    /// "BATCH000123": the batch's number the way the website writes it (`BATCH${String(number).padStart(6, '0')}`).
    var code: String {
        let digits = String(number)
        return "BATCH" + String(repeating: "0", count: max(0, 6 - digits.count)) + digits
    }
}

/// The Closeout screen's data: the open batch and the batch history from the server, and closing out the open batch.
/// It is loaded when a Closeout page appears, on pull to refresh, every 30 seconds while the list or the open batch is on screen,
/// and when the app comes back, so a payment or a closeout made on the website or another phone shows here too.
@Observable @MainActor
final class CloseoutModel {
    private(set) var open: CloseoutOpenBatch?
    private(set) var history: [CloseoutBatch] = []
    private(set) var loaded = false
    private(set) var loading = false
    /// What went wrong, in the server's words: shown in place of the batches until a load works, and in one quiet line above them
    /// when this login may not see them (a 403 is a message, never a sign-out).
    private(set) var loadError = ""
    @ObservationIgnored private var round = 0

    func load(siteID: String) async {
        round += 1
        let mine = round
        loading = true
        do {
            let answer = try await API.get("/api/sites/\(siteID)/closeouts")
            guard mine == round else { return }
            if answer["open"].isObject {
                let fresh = CloseoutOpenBatch(answer["open"])
                let list = answer["history"].array.compactMap { CloseoutBatch($0) }
                if fresh != open { open = fresh }
                if list != history { history = list }
                if !loaded { loaded = true }
                if !loadError.isEmpty { loadError = "" }
            } else if !loaded {
                loadError = "Something went wrong. Please try again."
            }
        } catch let error as APIError {
            guard mine == round else { return }
            // Signed out everywhere, or the server ended the session: the app checks, then locks. Anything else is a message;
            // a failed refresh keeps the batches it had.
            if error.status == 401 { AppModel.shared.sessionEnded() }
            if !loaded || error.forbidden { loadError = error.message }
        } catch {
            // Cancelled: the page went away.
        }
        if mine == round { loading = false }
    }

    /// Closes out the open batch (`POST /api/sites/<id>/closeouts`): the server files its totals under the batch history and a new
    /// batch starts. Then the batches are loaded again. The server's own words come back as the error.
    func closeOut(siteID: String) async throws {
        try await API.post("/api/sites/\(siteID)/closeouts")
        await load(siteID: siteID)
    }

    /// A closed batch as the latest load has it, or nil once it has left the latest 200.
    func batch(_ id: String) -> CloseoutBatch? { history.first { $0.id == id } }
}
