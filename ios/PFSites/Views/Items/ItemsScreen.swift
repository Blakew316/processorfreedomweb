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
                        ItemEditorPage(items: items, itemID: id, close: { dismiss() }, openMenus: { path.append(.web("menus")) })
                    case .add:
                        ItemEditorPage(items: items, itemID: nil, close: { dismiss() }, openMenus: { path.append(.web("menus")) })
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
    }
}

/// The bar of every page of the cover: the X (closes the cover) and "Items and services" bold in the middle.
struct ItemsCoverBar: ViewModifier {
    let close: () -> Void

    func body(content: Content) -> some View {
        content
            .navigationTitle("Items and services")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: close) {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
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
        .fileImporter(isPresented: $choosingFile, allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText]) { result in
            switch result {
            case .success(let url):
                read(url)
            case .failure:
                message = "We could not read that file."
            }
        }
        .sheet(item: $importPlan) { plan in
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
            Text("They are removed from your menu straight away. Past orders are kept.")
        }
        .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                Text("Items")
                    .pfFont(24, .bold, relativeTo: .title)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                moreMenu
            }
            .padding(.leading, 14)
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
                path.append(.web("alerts"))
            } label: {
                Label("Item settings", systemImage: "gearshape")
            }
        }
    }

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
        } else if items.selecting {
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                bulkMenu
                Button("Cancel") {
                    items.selecting = false
                    items.selection = []
                }
                .buttonStyle(ItemsPillStyle(kind: .darkGrey, width: 100))
            }
            .padding(.trailing, 22)
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
                Button {
                    path.append(.add)
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 19, weight: .light))
                        .foregroundStyle(ItemsLook.onBrand)
                }
                .buttonStyle(ItemsCapsuleStyle(fill: Theme.blue))
                .accessibilityLabel("Add item")
                Button("Select") {
                    items.selecting = true
                }
                .buttonStyle(ItemsPillStyle(kind: .grey, width: 100))
                .disabled(!items.loaded || items.items.isEmpty)
            }
            .padding(.trailing, 22)
        }
    }

    private var searchField: some View {
        HStack(spacing: 14) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Color.primary)
                .accessibilityHidden(true)
            TextField("Search items", text: Bindable(items).search, prompt: Text("Search items").foregroundStyle(ItemsLook.rowGrey))
                .pfFont(17)
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
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, 17)
        .padding(.trailing, 14)
        .frame(minHeight: 48)
        .background(ItemsLook.card, in: Capsule())
        .overlay {
            Capsule().strokeBorder(ItemsLook.field, lineWidth: 1)
        }
    }

    /// The website's bulk actions for the chosen items (itBulk in CL.items); greyed until something is chosen.
    private var bulkMenu: some View {
        ItemsKebab(label: "Actions for the chosen items", disabled: items.selection.isEmpty) {
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
            VStack(spacing: 16) {
                if !items.problem.isEmpty && !items.loading {
                    Text(items.problem)
                        .pfFont(17)
                        .foregroundStyle(Color.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try again") { Task { await items.load(model) } }
                        .buttonStyle(ItemsPillStyle(kind: .brand, width: 160))
                } else {
                    ProgressView()
                        .controlSize(.large)
                        .tint(Theme.blue)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
            .padding(.horizontal, 16)
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
                            .padding(.horizontal, 15)
                            .padding(.vertical, 12)
                    }
                    if items.searching {
                        Text("All results")
                            .pfFont(16, .bold)
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
                path.append(.edit(item.id))
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
            HStack(spacing: 14) {
                ItemsCheckbox(on: all)
                Text("Select all")
                    .pfFont(16.5, .bold)
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

    private func enterSearch() {
        items.searching = true
        Task {
            try? await Task.sleep(nanoseconds: 80_000_000)
            searchFocused = true
        }
    }

    private func leaveSearch() {
        searchFocused = false
        items.search = ""
        items.searching = false
    }

    private func ask(_ question: ItemsPrompt, value: String) {
        promptText = value
        prompt = question
    }

    private func run(_ body: [String: Any], note: String, after: (() -> Void)? = nil) {
        let ids = Array(items.selection)
        guard !ids.isEmpty else { return }
        Task {
            if let problem = await items.bulk(model, ids: ids, body: body) {
                message = problem
            } else {
                items.showToast(note)
                after?()
            }
        }
    }

    /// The answer to a prompt, checked the way the website checks it before anything is sent.
    private func answer(_ question: ItemsPrompt) {
        let value = promptText.trimmed
        let names = what
        switch question.kind {
        case .quantity:
            // The website's box takes numbers only: anything else sends nothing.
            guard let number = Double(value), number.isFinite else { return }
            run(["set": ["stock": number]], note: "Quantity set for \(names)")
        case .refill:
            if value.isEmpty {
                run(["set": ["restock": NSNull()]], note: "Daily refill updated for \(names)")
            } else if let number = Double(value), number.isFinite {
                run(["set": ["restock": number]], note: "Daily refill updated for \(names)")
            }
        case .sale:
            guard !value.isEmpty else { return }
            // A value outside what can be stored is refused with a reason, never changed quietly.
            guard let number = Double(value.replacingOccurrences(of: "%", with: "")), number.rounded() == number, number >= 0, number <= 90 else {
                message = "Enter a whole percent from 0 to 90."
                return
            }
            run(["set": ["sale": Int(number)]], note: "Sale updated for \(names)")
        case .price:
            guard !value.isEmpty else { return }
            guard let number = Double(value.replacingOccurrences(of: "%", with: "")), number.isFinite, number != 0, number >= -90, number <= 500 else {
                message = "Enter a change from -90 to 500 percent."
                return
            }
            run(["set": ["pricePercent": number]], note: "Prices updated for \(names)")
        case .category:
            guard !value.isEmpty else { return }
            run(["set": ["category": value]], note: "\(names) moved to \(value)")
        }
    }

    private func deleteChosen() {
        run(["delete": true], note: "\(what) deleted") {
            items.selection = []
            items.selecting = false
        }
    }

    private func export() {
        do {
            let file = try items.exportFile()
            UIPresenter.share(file)
        } catch {
            message = "The file could not be saved. Please try again."
        }
    }

    /// An item list chosen in Files: read the way the server will read it, then the import sheet says what it found.
    private func read(_ url: URL) {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            message = "We could not read that file."
            return
        }
        let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .windowsCP1252) ?? String(decoding: data, as: UTF8.self)
        importPlan = ItemsImportPlan(fileName: url.lastPathComponent, csv: text, reading: ItemsCSV.read(text))
    }
}

/// A row of the list, as in the photos: the bold name (two lines at most), "Item name: …" and "Price: …" in grey, a chevron; while
/// selecting, a checkbox on the left instead of the chevron.
struct ItemsListRow: View {
    let item: CatalogItem
    var selecting = false
    var selected = false

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            if selecting {
                ItemsCheckbox(on: selected)
                    .padding(.trailing, 14)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(item.name)
                    .pfFont(17, .bold)
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
        .padding(.leading, selecting ? 19 : 15)
        .padding(.trailing, selecting ? 35 : 31)
        .padding(.vertical, 20)
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
                Text("Filter item results")
                    .pfFont(18, .bold, relativeTo: .headline)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                Button(action: close) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.primary)
                        .frame(width: 34, height: 34)
                        .overlay {
                            Circle().strokeBorder(Theme.blue, lineWidth: 2)
                        }
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
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
            HStack(spacing: 16) {
                Button("Reset filters") {
                    items.filter = ItemsFilter()
                    close()
                }
                .buttonStyle(ItemsPillStyle(kind: .grey, height: 45, size: 16, weight: .medium))
                Button("Show results") {
                    items.filter = next
                    close()
                }
                .buttonStyle(ItemsPillStyle(kind: .brand, height: 45, size: 16, weight: .medium))
            }
            .padding(.top, 17)
            .padding(.bottom, 14)
        }
        .background(Color(.systemBackground), ignoresSafeAreaEdges: .bottom)
        .accessibilityAddTraits(.isModal)
    }

    private func row(_ label: String, on: Bool, greyed: Bool = false, toggle: (() -> Void)? = nil) -> some View {
        VStack(spacing: 0) {
            ItemsHairline()
            Button {
                toggle?()
            } label: {
                HStack(spacing: 13) {
                    ItemsCheckbox(on: on, greyed: greyed, border: ItemsLook.soft)
                    Text(label)
                        .pfFont(16, .medium)
                        .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 68)
                .padding(.vertical, 12)
                .frame(minHeight: 72)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(greyed)
            .accessibilityValue(greyed ? "Not available yet" : (on ? "Checked" : "Not checked"))
        }
    }
}
