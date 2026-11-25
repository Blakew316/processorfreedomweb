import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Where the Items and services cover goes inside its own navigation stack.
enum ItemsRoute: Hashable {
    case edit(String)     // an item, by its id
    case add              // the same editor, empty
    case web(String)      // a back-office web page (the Menus page, the item settings)
}

/// Home → Items and services (the owner's Clover photos): a full-screen cover with an X at the top left and the bold title in the
/// middle of the bar, the business's items on the grey page below, and the item editor pushed inside it.
struct ItemsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var items = ItemsModel()
    @State private var path: [ItemsRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            ItemsListPage(items: items, path: $path, close: { dismiss() })
                .navigationDestination(for: ItemsRoute.self) { route in
                    switch route {
                    case .edit(let id):
                        ItemEditorPage(items: items, itemID: id, close: { dismiss() }, openMenus: { openMenus() })
                    case .add:
                        ItemEditorPage(items: items, itemID: nil, close: { dismiss() }, openMenus: { openMenus() })
                    case .web(let tab):
                        WebScreen(tab: tab)
                    }
                }
        }
        .tint(Theme.blue)
        .onChange(of: path) { old, new in
            // Back from a page: anything changed there (the Menus page, the item settings) shows here.
            if new.count < old.count { Task { await items.load(model) } }
        }
        // Items was closed: a change still on its way says what went wrong another way (see ItemsListPage.run).
        .onDisappear { items.closedAt = Date() }
    }

    /// The website's Menus page over the editor, once: a second tap before it has slid in opens nothing more.
    private func openMenus() {
        guard path.count == 1 else { return }
        path.append(.web("menus"))
    }
}

/// The bar of every page of the cover: the X (closes the cover) and "Items and services" bold in the middle. `busy` keeps the X
/// from closing while a save or a delete is on its way.
struct ItemsCoverBar: ViewModifier {
    let close: () -> Void
    var busy = false

    func body(content: Content) -> some View {
        content
            .navigationTitle("Items and services")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                // The photos' bare black X, its centre 28 pt from the edge, with no glass circle behind it (as on Closeout).
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: close) {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .regular))
                            .foregroundStyle(busy ? ItemsLook.greyed : Color.primary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .offset(x: -10)
                    .disabled(busy)
                    .accessibilityLabel("Close")
                }
                .sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .principal) {
                    Text("Items and services")
                        .pfFont(19, .bold, relativeTo: .headline)
                        .lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .steadyNavigationBar()
    }
}

/// When the list loads again: each time it shows, and when the app is back in front and unlocked.
private struct ItemsLoadKey: Hashable {
    let active: Bool
    let ready: Bool
}

/// A question the bulk actions ask (the website's prompts), answered in an alert with a text box.
private struct ItemsPrompt: Identifiable {
    enum Kind {
        case quantity, refill, sale, price, category
    }

    let id = UUID()
    let kind: Kind
    let title: String
    let label: String
    var hint: String? = nil
    var keyboard: UIKeyboardType = .default
}

/// The Items list (photos 87b003b2, 6f4a7acd, d983a5de, 9193ee1f): the "Items" title with its ⋮ menu, the row of round buttons
/// (search, filters, the brand-blue "+" and Select), then the items. Searching and Select change the row as in their photos.
struct ItemsListPage: View {
    let items: ItemsModel
    @Binding var path: [ItemsRoute]
    let close: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var searchFocused: Bool
    @State private var showFilters = false
    @State private var choosingFile = false
    @State private var importPlan: ItemsImportPlan?
    @State private var prompt: ItemsPrompt?
    @State private var promptText = ""
    @State private var confirmingDelete = false
    @State private var message: String?
    /// A change to the chosen items is on its way: no second one is sent before the server has answered the first.
    @State private var working = false

    var body: some View {
        VStack(spacing: 0) {
            header
            ItemsListLine()
            content
        }
        .background(ItemsLook.page, ignoresSafeAreaEdges: .bottom)
        .accessibilityHidden(showFilters)
        .overlay {
            if showFilters {
                ItemsFilterPanel(items: items) {
                    withAnimation(.snappy) { showFilters = false }
                }
                .transition(.move(edge: .bottom))
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = items.toast, !showFilters {
                ItemsToast(text: toast)
                    .padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: items.toast)
        .background(Color(.systemBackground))
        .modifier(ItemsCoverBar(close: close))
        .task(id: ItemsLoadKey(active: scenePhase == .active, ready: model.phase == .ready)) {
            // When the list shows and whenever the app comes back, so a change made on the website or another phone shows up.
            guard scenePhase == .active, model.phase == .ready else { return }
            await items.load(model)
        }
        // Typing is not a touch on the screen: it counts for the 15-minute rule too, as on the Sale screen.
        .onChange(of: items.search) { _, _ in model.idle.touch() }
        .fileImporter(isPresented: $choosingFile, allowedContentTypes: Self.listFileTypes) { result in
            let picked = Date()
            switch result {
            case .success(let url):
                read(url, picked: picked)
            case .failure:
                say("We could not read that file.", after: picked, wait: 0.6)
            }
        }
        .sheet(item: $importPlan, onDismiss: {
            // Words the import sheet left for the list, said once the sheet has gone (two presentations cannot overlap).
            if let text = items.notice {
                items.notice = nil
                if model.phase == .ready { message = text }
            }
        }) { plan in
            ItemsImportSheet(plan: plan, items: items)
                .environment(model)
        }
        .alert(prompt?.title ?? "", isPresented: Binding(get: { prompt != nil }, set: { if !$0 { prompt = nil } }), presenting: prompt) { asked in
            TextField(asked.label, text: $promptText)
                .keyboardType(asked.keyboard)
                .autocorrectionDisabled()
            Button("Apply") { answer(asked) }
            Button("Cancel", role: .cancel) {}
        } message: { asked in
            Text([asked.label, asked.hint].compactMap { $0 }.joined(separator: "\n"))
        }
        .alert("Delete \(what)?", isPresented: $confirmingDelete) {
            Button("Delete", role: .destructive) { deleteChosen() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(items.selection.count == 1 ? "It is removed from your menu straight away. Past orders are kept." : "They are removed from your menu straight away. Past orders are kept.")
        }
        // The app locked (the session had ended): "Please sign in to continue." is not left up for after the passcode.
        .onChange(of: model.phase) { _, now in
            if now != .ready { message = nil }
        }
        .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                // The "I" starts 14 pt from the edge, and the capitals sit 1 pt under the middle of the round button, as in the photos.
                Text("Items")
                    .pfFont(24, .bold, relativeTo: .title)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 1.7)
                Spacer(minLength: 12)
                moreMenu
            }
            .padding(.leading, 12.7)
            .padding(.trailing, 20)
            .padding(.top, 16)
            toolRow
                .padding(.top, 20)
                .padding(.bottom, 28)
        }
    }

    /// Export, Import, Print and Item settings, each with its line icon.
    private var moreMenu: some View {
        ItemsKebab(label: "More actions") {
            Button {
                export()
            } label: {
                Label("Export", systemImage: "tray.and.arrow.down")
            }
            .disabled(!items.loaded)
            Button {
                choosingFile = true
            } label: {
                Label("Import", systemImage: "tray.and.arrow.up")
            }
            .disabled(!items.loaded)
            Button {
                items.printList()
            } label: {
                Label("Print", systemImage: "printer")
            }
            .disabled(!items.loaded)
            Button {
                // The website keeps the item settings (the low stock warning) with its alerts.
                open(.web("alerts"))
            } label: {
                Label("Item settings", systemImage: "gearshape")
            }
        }
    }

    /// The row under the title: the round buttons, or the search field, or (while selecting) the ⋮ of the chosen items and
    /// Cancel. The three fade into one another in place: all are 48 pt tall.
    @ViewBuilder
    private var toolRow: some View {
        if items.searching {
            HStack(spacing: 8) {
                Button {
                    leaveSearch()
                } label: {
                    Image(systemName: "arrow.left")
                        .font(.system(size: 19, weight: .regular))
                        .foregroundStyle(Color.primary)
                        .frame(width: 48, height: 48)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")
                searchField
                moreMenu
            }
            .padding(.leading, 14)
            .padding(.trailing, 22)
            .transition(.opacity)
        } else if items.selecting {
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                bulkMenu
                Button("Cancel") {
                    withAnimation(.snappy(duration: 0.25)) {
                        items.selecting = false
                        items.selection = []
                    }
                }
                .buttonStyle(ItemsPillStyle(kind: .darkGrey, width: 100))
            }
            .padding(.trailing, 22)
            .transition(.opacity)
        } else {
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                Button {
                    enterSearch()
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(Color.primary)
                }
                .buttonStyle(ItemsCapsuleStyle())
                .accessibilityLabel("Search")
                Button {
                    withAnimation(.snappy) { showFilters = true }
                } label: {
                    ItemsSlidersIcon()
                        .overlay(alignment: .topTrailing) {
                            if !items.filter.isEmpty {
                                Circle().fill(Theme.blue).frame(width: 8, height: 8).offset(x: 7, y: -5)
                            }
                        }
                }
                .buttonStyle(ItemsCapsuleStyle())
                .accessibilityLabel("Filters")
                .accessibilityValue(items.filter.isEmpty ? "" : "On")
                // Once the list is in, so a new item starts in the website's default category and the editor has the item settings.
                Button {
                    open(.add)
                } label: {
                    ItemsPlus(color: items.loaded ? ItemsLook.onBrand : ItemsLook.greyed)
                }
                .buttonStyle(ItemsCapsuleStyle(fill: Theme.blue))
                .disabled(!items.loaded)
                .accessibilityLabel("Add item")
                Button("Select") {
                    withAnimation(.snappy(duration: 0.25)) { items.selecting = true }
                }
                .buttonStyle(ItemsPillStyle(kind: .grey, width: 100))
                .disabled(!items.loaded || items.items.isEmpty)
            }
            .padding(.trailing, 22)
            .transition(.opacity)
        }
    }

    /// The search pill: the magnifier 17 pt in from its edge and "Search items" 12.7 pt after it, as in the photo.
    private var searchField: some View {
        HStack(spacing: 10.3) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(ItemsLook.rowGrey)
                .accessibilityHidden(true)
            TextField("Search items", text: Bindable(items).search, prompt: Text("Search items").foregroundStyle(ItemsLook.searchHint))
                .pfFont(16)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($searchFocused)
            if !items.search.isEmpty {
                Button {
                    items.search = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.secondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, -12)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, 15)
        .padding(.trailing, 14)
        .frame(minHeight: 48)
        .background(ItemsLook.card, in: Capsule())
        .overlay {
            Capsule().strokeBorder(ItemsLook.field, lineWidth: 1)
        }
        .contentShape(Capsule())
        .onTapGesture { searchFocused = true }
    }

    /// The website's bulk actions for the chosen items (itBulk in CL.items); greyed until something is chosen.
    private var bulkMenu: some View {
        ItemsKebab(label: "Actions for the chosen items", disabled: items.selection.isEmpty || working) {
            Section("Sales tax") {
                Button("On") { run(["set": ["taxable": true]], note: "Sales tax on for \(what)") }
                Button("Off") { run(["set": ["taxable": false]], note: "Sales tax off for \(what)") }
            }
            Section("On the menu") {
                Button("Show") { run(["set": ["available": true]], note: "\(what) shown") }
                Button("Hide") { run(["set": ["available": false]], note: "\(what) hidden") }
            }
            Section {
                Button("Quantity") { ask(ItemsPrompt(kind: .quantity, title: "Set quantity for \(what)", label: "In stock", keyboard: .numberPad), value: "") }
                Button("Daily refill") {
                    ask(ItemsPrompt(kind: .refill, title: "Refill \(what) every morning", label: "Refill to", hint: "Leave it empty to switch daily refill off.", keyboard: .numberPad), value: "")
                }
                Button("Sale") { ask(ItemsPrompt(kind: .sale, title: "Put \(what) on sale", label: "Percent off (0 ends a sale)", keyboard: .numbersAndPunctuation), value: "10") }
                Button("Price") { ask(ItemsPrompt(kind: .price, title: "Change the price of \(what)", label: "Percent change (-10 lowers prices)", keyboard: .numbersAndPunctuation), value: "5") }
                Button("Category") { ask(ItemsPrompt(kind: .category, title: "Move \(what)", label: "Category"), value: firstItemCategory) }
            }
            Section {
                Button("Delete", role: .destructive) { confirmingDelete = true }
            }
        }
    }

    // MARK: The list

    @ViewBuilder
    private var content: some View {
        if !items.loaded {
            // Waiting, or what went wrong with Try again, as every other screen of the app shows them.
            SettingsA.LoadState(loading: items.loading, problem: items.problem) {
                Task { await items.load(model) }
            }
            Spacer(minLength: 0)
        } else {
            let shown = items.shown
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if !items.problem.isEmpty {
                        // The last refresh did not work: the list stays as it was, with the server's words above it.
                        Text(items.problem)
                            .pfFont(15)
                            .foregroundStyle(Color.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 14.2)
                            .padding(.vertical, 12)
                    }
                    if items.searching {
                        Text("All results")
                            .pfFont(16.5, .semibold)
                            .foregroundStyle(Color.primary)
                            .padding(.leading, 14)
                            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                            .accessibilityAddTraits(.isHeader)
                        ItemsListLine()
                    }
                    if items.selecting && !shown.isEmpty {
                        selectAllRow(shown)
                        ItemsListLine()
                        ItemsListLine()
                    }
                    if shown.isEmpty {
                        // The website's words for an empty list.
                        Text(items.items.isEmpty ? "You do not have any items" : "No items found")
                            .pfFont(17)
                            .foregroundStyle(Color.secondary)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 60)
                            .padding(.horizontal, 16)
                    } else {
                        ForEach(shown) { item in
                            row(item)
                            ItemsListLine()
                        }
                    }
                }
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await items.load(model) }
        }
    }

    private func row(_ item: CatalogItem) -> some View {
        let chosen = items.selection.contains(item.id)
        return Button {
            if items.selecting {
                if chosen { items.selection.remove(item.id) } else { items.selection.insert(item.id) }
            } else {
                searchFocused = false
                open(.edit(item.id))
            }
        } label: {
            ItemsListRow(item: item, selecting: items.selecting, selected: chosen)
        }
        .buttonStyle(.plain)
        .accessibilityValue(items.selecting ? (chosen ? "Selected" : "Not selected") : "")
    }

    private func selectAllRow(_ shown: [CatalogItem]) -> some View {
        let all = shown.allSatisfy { items.selection.contains($0.id) }
        return Button {
            if all {
                for item in shown { items.selection.remove(item.id) }
            } else {
                for item in shown { items.selection.insert(item.id) }
            }
        } label: {
            HStack(spacing: 13) {
                ItemsCheckbox(on: all)
                Text("Select all")
                    .pfFont(17, .semibold)
                    .foregroundStyle(Color.primary)
                Spacer(minLength: 0)
            }
            .padding(.leading, 19)
            .frame(minHeight: 62)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(all ? "Selected" : "Not selected")
    }

    // MARK: Actions

    /// "1 item" or "3 items", as the website names the chosen items.
    private var what: String {
        let count = items.selection.count
        return count == 1 ? "1 item" : "\(count) items"
    }

    /// The first category of the items, offered by Category as the website does.
    private var firstItemCategory: String { items.items.first?.category ?? "" }

    /// Opens a page of the cover once: a second tap on the same row before the page has slid in opens nothing more.
    private func open(_ route: ItemsRoute) {
        guard path.isEmpty else { return }
        path.append(route)
    }

    private func enterSearch() {
        withAnimation(.snappy(duration: 0.25)) { items.searching = true }
        Task {
            try? await Task.sleep(nanoseconds: 80_000_000)
            searchFocused = true
        }
    }

    private func leaveSearch() {
        searchFocused = false
        withAnimation(.snappy(duration: 0.25)) {
            items.search = ""
            items.searching = false
        }
    }

    private func ask(_ question: ItemsPrompt, value: String) {
        promptText = value
        prompt = question
    }

    /// Sends a change for the chosen items, one at a time. `asked` is when the alert that led here was answered: what the server
    /// says about it waits until that alert has gone, since two alerts cannot be up at once.
    private func run(_ body: [String: Any], note: String, asked: Date? = nil, after: (() -> Void)? = nil) {
        let ids = Array(items.selection)
        guard !ids.isEmpty, !working else { return }
        working = true
        model.idle.touch()
        Task {
            let problem = await items.bulk(model, ids: ids, body: body)
            working = false
            if let problem {
                Haptics.error()
                await ItemsAlerts.settled(since: asked)
                // Not under the lock screen: the app may have locked while the alert before this one was going away.
                if let closedAt = items.closedAt {
                    // Items was closed with its X while the change was on its way (it may even be open again, as another
                    // page): the words are still said, over whatever is showing, once the cover has finished sliding away.
                    // Set on the page that has gone they were never seen, and the person left believing the items were
                    // changed or deleted.
                    await ItemsAlerts.settled(since: closedAt, wait: 0.7)
                    if model.phase == .ready { UIPresenter.message(problem) }
                } else if model.phase == .ready {
                    message = problem
                }
            } else {
                Haptics.success()
                items.showToast(note)
                after?()
            }
        }
    }

    /// A message in its own alert, once the alert or the picker that led to it has gone.
    private func say(_ text: String, after asked: Date, wait: Double = 0.45) {
        Haptics.error()
        Task {
            await ItemsAlerts.settled(since: asked, wait: wait)
            if model.phase == .ready { message = text }
        }
    }

    /// The answer to a prompt, checked the way the website checks it before anything is sent.
    private func answer(_ question: ItemsPrompt) {
        let asked = Date()
        let value = promptText.trimmed
        let names = what
        switch question.kind {
        case .quantity:
            // The website's box takes numbers only: anything else sends nothing.
            guard let number = Double(value), number.isFinite else { return }
            run(["set": ["stock": number]], note: "Quantity set for \(names)", asked: asked)
        case .refill:
            if value.isEmpty {
                run(["set": ["restock": NSNull()]], note: "Daily refill updated for \(names)", asked: asked)
            } else if let number = Double(value), number.isFinite {
                run(["set": ["restock": number]], note: "Daily refill updated for \(names)", asked: asked)
            }
        case .sale:
            guard !value.isEmpty else { return }
            // A value outside what can be stored is refused with a reason, never changed quietly.
            guard let number = Double(value.replacingOccurrences(of: "%", with: "").trimmed), number.rounded() == number, number >= 0, number <= 90 else {
                say("Enter a whole percent from 0 to 90.", after: asked)
                return
            }
            run(["set": ["sale": Int(number)]], note: "Sale updated for \(names)", asked: asked)
        case .price:
            guard !value.isEmpty else { return }
            guard let number = Double(value.replacingOccurrences(of: "%", with: "").trimmed), number.isFinite, number != 0, number >= -90, number <= 500 else {
                say("Enter a change from -90 to 500 percent.", after: asked)
                return
            }
            run(["set": ["pricePercent": number]], note: "Prices updated for \(names)", asked: asked)
        case .category:
            guard !value.isEmpty else { return }
            run(["set": ["category": value]], note: "\(names) moved to \(value)", asked: asked)
        }
    }

    private func deleteChosen() {
        run(["delete": true], note: "\(what) deleted", asked: Date()) {
            withAnimation(.snappy(duration: 0.25)) {
                items.selection = []
                items.selecting = false
            }
        }
    }

    private func export() {
        do {
            let file = try items.exportFile()
            UIPresenter.share(file)
        } catch {
            Haptics.error()
            message = "The file could not be saved. Please try again."
        }
    }

    /// The files an item list can come from: CSV, tab-separated or plain text, and Excel workbooks (.xlsx), as on the website.
    private static let listFileTypes: [UTType] = [.commaSeparatedText, .tabSeparatedText, .plainText] + [UTType(filenameExtension: "xlsx")].compactMap { $0 }

    /// An item list chosen in Files: read the way the server will read it, then the import sheet says what it found, once the
    /// file picker has finished closing (a sheet cannot come up while another is still going away).
    private func read(_ url: URL, picked: Date) {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        // A file far past what can be imported is not read at all: reading and sorting it would freeze the app, and the server
        // would refuse it anyway, in these words. (64 MB is the most an Excel workbook is read at; 1.5 MB the most text the
        // server takes.)
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        guard size <= 64 * 1024 * 1024 else {
            say("That is too large to upload.", after: picked, wait: 0.6)
            return
        }
        guard let data = try? Data(contentsOf: url) else {
            say("We could not read that file.", after: picked, wait: 0.6)
            return
        }
        // An Excel workbook is turned into the same text a CSV file holds; from there the two are read alike.
        let text: String
        if ItemsXLSX.looksLikeWorkbook(data) {
            guard let sheet = ItemsXLSX.csv(from: data) else {
                say("We could not read that Excel file. Save it as CSV and choose it again.", after: picked, wait: 0.6)
                return
            }
            text = sheet
        } else if ItemsXLSX.looksLikeOldExcel(data) {
            // An .xls file, or a workbook saved with a password (Excel keeps those in the old container too).
            say("That is an older Excel file (.xls), or one protected with a password. Remove the password, or save it as .xlsx or CSV, and choose it again.", after: picked, wait: 0.6)
            return
        } else {
            guard data.count <= 1_500_000 else {
                say("That is too large to upload.", after: picked, wait: 0.6)
                return
            }
            text = ItemsCSV.text(from: data)
        }
        let plan = ItemsImportPlan(fileName: url.lastPathComponent, csv: text, reading: ItemsCSV.read(text))
        Task {
            await ItemsAlerts.settled(since: picked, wait: 0.6)
            importPlan = plan
        }
    }
}

/// A row of the list, as in the photos: the semibold name (two lines at most), "Item name: …" and "Price: …" in grey, a chevron; while
/// selecting, a checkbox on the left instead of the chevron.
struct ItemsListRow: View {
    let item: CatalogItem
    var selecting = false
    var selected = false

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            if selecting {
                ItemsCheckbox(on: selected)
                    .padding(.trailing, 13)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(item.name)
                    .pfFont(17, .semibold)
                    .foregroundStyle(Color.primary)
                    .lineLimit(2)
                    .lineSpacing(3.7)
                Text("Item name: \(item.name)")
                    .pfFont(14)
                    .foregroundStyle(ItemsLook.rowGrey)
                    .lineLimit(2)
                    .lineSpacing(3)
                    .padding(.top, 8)
                Text("Price: \(item.priceText)")
                    .pfFont(14)
                    .foregroundStyle(ItemsLook.rowGrey)
                    .padding(.top, 7)
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            if !selecting {
                Image(systemName: "chevron.right")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(Color.primary)
                    .padding(.leading, 16)
                    .accessibilityHidden(true)
            }
        }
        .padding(.leading, selecting ? 19 : 14.2)
        .padding(.trailing, selecting ? 35 : 31)
        // A row with one-line names is 110 pt from rule to rule, as in the photos.
        .padding(.top, 20)
        .padding(.bottom, 18.7)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// "Filter item results" (photo 86be9fb9), over the list below the bar: checkbox rows with hairlines, Reset filters and Show results.
/// What Processor Freedom does not have (services, point of sale devices, age limits) is greyed; the website's own filters (low
/// stock, hidden, on sale and each category) are rows of the same kind.
struct ItemsFilterPanel: View {
    let items: ItemsModel
    let close: () -> Void
    @State private var next: ItemsFilter

    init(items: ItemsModel, close: @escaping () -> Void) {
        self.items = items
        self.close = close
        _next = State(initialValue: items.filter)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                // Its baseline 38 pt under the bar, as in the photo.
                Text("Filter item results")
                    .pfFont(18.5, .bold, relativeTo: .headline)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 2.1)
                Spacer(minLength: 12)
                ItemsCloseButton(action: close)
            }
            .padding(.leading, 26)
            .padding(.trailing, 21)
            .frame(minHeight: 61)
            ItemsHairline(color: Color(light: UIColor(hex: 0xEDEDED), dark: UIColor(hex: 0x38383A)))
            ScrollView {
                VStack(spacing: 0) {
                    row("Item", on: next.item) { next.item.toggle() }
                    row("Service", on: false, greyed: true)
                    row("Out of stock", on: next.out) { next.out.toggle() }
                    row("POS items", on: false, greyed: true)
                    row("Non-POS items", on: false, greyed: true)
                    row("Age-restricted", on: false, greyed: true)
                    row("Low stock", on: next.low) { next.low.toggle() }
                    row("Hidden", on: next.hidden) { next.hidden.toggle() }
                    row("On sale", on: next.sale) { next.sale.toggle() }
                    ForEach(items.categoryNames, id: \.self) { name in
                        row(name, on: next.cats.contains(name)) {
                            if next.cats.contains(name) { next.cats.remove(name) } else { next.cats.insert(name) }
                        }
                    }
                }
                .padding(.top, 16)
                .padding(.horizontal, 17)
                .padding(.bottom, 24)
            }
            ItemsHairline(color: ItemsLook.control)
            // 48 pt pills, 16 pt under the rule and 12 pt above the home indicator, as in the photo.
            HStack(spacing: 16) {
                Button("Reset filters") {
                    items.filter = ItemsFilter()
                    close()
                }
                .buttonStyle(ItemsPillStyle(kind: .grey, height: 48, size: 16, weight: .medium))
                Button("Show results") {
                    items.filter = next
                    close()
                }
                .buttonStyle(ItemsPillStyle(kind: .brand, height: 48, size: 16, weight: .medium))
            }
            .padding(.top, 16)
            .padding(.bottom, 12)
        }
        .background(Color(.systemBackground), ignoresSafeAreaEdges: .bottom)
        .accessibilityAddTraits(.isModal)
    }

    @ViewBuilder
    private func row(_ label: String, on: Bool, greyed: Bool = false, toggle: (() -> Void)? = nil) -> some View {
        ItemsHairline()
        if greyed {
            // Drawn as it is, never as a button that cannot be pressed: that would fade it more than the greyed things around it.
            rowLabel(label, on: on, greyed: true)
                .accessibilityElement(children: .combine)
                .accessibilityValue("Not available yet")
        } else {
            Button {
                toggle?()
            } label: {
                rowLabel(label, on: on, greyed: false)
            }
            .buttonStyle(.plain)
            .accessibilityValue(on ? "Checked" : "Not checked")
        }
    }

    private func rowLabel(_ label: String, on: Bool, greyed: Bool) -> some View {
        HStack(spacing: 12) {
            ItemsCheckbox(on: on, greyed: greyed, border: ItemsLook.soft)
            Text(label)
                .pfFont(16.5, .medium)
                .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(.leading, 68)
        .padding(.vertical, 12)
        .frame(minHeight: 72)
        .contentShape(Rectangle())
    }
}
