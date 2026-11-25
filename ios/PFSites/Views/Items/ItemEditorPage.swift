import PhotosUI
import SwiftUI
import UIKit

/// The item editor (the owner's photos 29644fdd to 20d06940), pushed inside the Items and services cover, for an item that exists
/// or a new one (the "+" of the list opens it empty, and nothing is made until Save). Under the cover's bar: the grey
/// "← Item list" bar, the item's name large and bold with its ⋮ (Delete item), the white cards, and at the bottom Cancel and Save
/// (greyed until something changed).
struct ItemEditorPage: View {
    let items: ItemsModel
    let close: () -> Void
    let openMenus: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var editor: ItemEditorModel
    @FocusState private var focus: ItemEditorField?
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var askingToLeave = false
    @State private var afterLeaving: (() -> Void)?
    @State private var message: String?
    @State private var reveal = ItemsReveal()
    @State private var choosingPhoto = false
    @State private var photoPick: PhotosPickerItem?
    @State private var loadingPhoto = false
    @State private var assigningCategory = false
    /// Counts the saves that a field refused, so the page can bring that field into view each time.
    @State private var refusals = 0

    init(items: ItemsModel, itemID: String?, close: @escaping () -> Void, openMenus: @escaping () -> Void) {
        self.items = items
        self.close = close
        self.openMenus = openMenus
        let item = itemID.flatMap { items.item($0) }
        // The website's Add item: a new item goes in the business's last category, or "Menu" when there is none.
        let newCategory = items.categoryNames.last ?? "Menu"
        _editor = State(initialValue: ItemEditorModel(item: item, newCategory: newCategory))
    }

    var body: some View {
        VStack(spacing: 0) {
            backBar
            ItemsHairline()
            ScrollViewReader { reader in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        headingRow
                        cards
                            .padding(.top, 32)
                    }
                    .padding(.bottom, 65)
                    .disabled(editor.saving || deleting)
                }
                .scrollDismissesKeyboard(.interactively)
                // Save is always in reach, the field it refused may be far up the page, in a card that was folded: the card
                // opens, then the field is brought into view (a field of a folded card is not on the page to scroll to).
                .onChange(of: refusals) { _, round in
                    guard let field = editor.firstProblem else { return }
                    reveal = ItemsReveal(card: Self.card(of: field), round: round)
                    Task {
                        try? await Task.sleep(nanoseconds: 150_000_000)
                        withAnimation(.snappy) { reader.scrollTo(field, anchor: .center) }
                    }
                }
                .environment(\.itemsReveal, reveal)
            }
            ItemsHairline()
            bottomBar
        }
        // The grey page stops above the home indicator, as in the photos.
        .background(ItemsLook.page, ignoresSafeAreaEdges: [])
        .background(Color(.systemBackground))
        .modifier(ItemsCoverBar(close: { leave(then: close) }, busy: editor.saving || deleting))
        // Typing is not a touch on the screen: it counts for the 15-minute rule too, as on Create appointment.
        .onChange(of: editor.draft) { _, _ in model.idle.touch() }
        // The app locked (the session had ended): "Please sign in to continue." is not left up for after the passcode.
        .onChange(of: model.phase) { _, now in
            if now != .ready { message = nil }
        }
        // The item settings came after a new item was opened: it starts where the website's Add item would put it.
        .onChange(of: items.settingsAsked) { _, asked in
            if asked { editor.startCategory(items.categoryNames.last ?? "Menu") }
        }
        // Opening this page over the list stops the list's own request, so settings still on their way then (the categories,
        // labels and modifier groups to choose from) are asked for here.
        .task {
            if !items.settingsAsked { await items.load(model) }
        }
        .toolbar {
            // Number pads have no return key: Done puts the keyboard away.
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus = nil }
            }
        }
        .photosPicker(isPresented: $choosingPhoto, selection: $photoPick, matching: .images)
        .onChange(of: photoPick) { _, pick in
            guard let pick else { return }
            photoPick = nil
            usePhoto(pick)
        }
        .sheet(isPresented: $assigningCategory) {
            ItemsCategoryPicker(names: items.categoryNames, current: editor.draft.category) { name in
                editor.chooseCategory(items.canonicalCategory(name))
            }
        }
        .alert("Delete \(editor.heading)?", isPresented: $confirmingDelete) {
            Button("Delete", role: .destructive) { delete() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("It is removed from your menu straight away. Past orders are kept.")
        }
        .confirmationDialog("Your changes to this item are not saved.", isPresented: $askingToLeave, titleVisibility: .visible) {
            Button("Discard changes", role: .destructive) {
                let next = afterLeaving
                afterLeaving = nil
                next?()
            }
            Button("Keep editing", role: .cancel) {
                afterLeaving = nil
            }
        }
        .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    // MARK: Bars

    /// "← Item list": back to the list (asking first when something changed), 68 pt tall with a hairline under it.
    private var backBar: some View {
        Button {
            leave(then: { dismiss() })
        } label: {
            // The arrow starts 25.7 pt from the edge and the words 13 pt after it, as in the photos (the symbol and the letters
            // each carry a little air of their own).
            HStack(spacing: 8.7) {
                Image(systemName: "arrow.left")
                    .font(.system(size: 19, weight: .regular))
                Text("Item list")
                    .pfFont(18.5, .bold)
            }
            .foregroundStyle(Color.primary)
            .padding(.leading, 23.4)
            .padding(.trailing, 16)
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(editor.saving || deleting)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("Back to Item list")
    }

    /// The item's name on one line (cut short with "…"), or the website's words for an item not made yet, with the ⋮ of an item
    /// that exists.
    private var headingRow: some View {
        HStack(spacing: 0) {
            // Its baseline 1 pt under where the row's middle would put it, as in the photos.
            Text(editor.heading)
                .pfFont(25, .bold, relativeTo: .title)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .truncationMode(.tail)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, 2)
            Spacer(minLength: 64)
            if !editor.isNew {
                ItemsKebab(label: "Item actions") {
                    Button(role: .destructive) {
                        confirmingDelete = true
                    } label: {
                        Label("Delete item", systemImage: "trash")
                    }
                }
            }
        }
        .frame(minHeight: 48)
        .padding(.leading, 20)
        .padding(.trailing, 13)
        .padding(.top, 24)
    }

    /// Cancel (grey pill) and Save (brand blue once something changed).
    private var bottomBar: some View {
        HStack(spacing: 16) {
            Button("Cancel") {
                leave(then: { dismiss() })
            }
            .buttonStyle(ItemsPillStyle(kind: .grey, height: 50, size: 17, weight: .semibold))
            .disabled(editor.saving || deleting)
            Spacer(minLength: 0)
            Button {
                save()
            } label: {
                if editor.saving {
                    ProgressView()
                        .accessibilityLabel("Saving")
                } else {
                    Text("Save")
                }
            }
            .buttonStyle(ItemsPillStyle(kind: .brand, height: 50, size: 17, weight: .semibold))
            .disabled(!editor.changed || editor.saving || deleting || editor.uploading || loadingPhoto)
        }
        .padding(.leading, 20)
        .padding(.trailing, 28)
        .padding(.vertical, 16)
        // Not under the home indicator: that strip stays white, as in the photos.
        .background(ItemsLook.page, ignoresSafeAreaEdges: [])
    }

    // MARK: Cards

    private var cards: some View {
        VStack(alignment: .leading, spacing: 40) {
            ItemDetailsCard(editor: editor, focus: $focus, photoBusy: loadingPhoto) {
                focus = nil
                choosingPhoto = true
            }
            ItemSaleCard(editor: editor, focus: $focus)
            ItemTaxCard(editor: editor)
            ItemLabelCard(editor: editor, labels: items.settings.labels)
            ItemModsCard(editor: editor, groups: items.settings.modGroups)
            ItemOptionsCard(editor: editor, focus: $focus)
            ItemCategoriesCard(editor: editor) {
                focus = nil
                assigningCategory = true
            }
            ItemCostCard(editor: editor, focus: $focus, classes: items.settings.revClasses)
            ItemMenusCard(menus: menusWithItem, price: editor.original?.priceText ?? "", openMenus: openMenus)
            ItemTrackingCard(editor: editor, focus: $focus) {
                scan()
            }
        }
        .padding(.leading, 20)
        .padding(.trailing, 28)
    }

    /// The menus that really include the item: the ones made of its saved category.
    private var menusWithItem: [ItemsSettings.OnlineMenu] {
        guard let category = editor.original?.category else { return [] }
        return items.settings.menus.filter { $0.cats.contains(category) }
    }

    // MARK: Actions

    /// Leaves the editor (back to the list, or closing the cover), asking first when something changed. Never while a save or a
    /// delete is on its way: if the server refuses it, the person must see why, with their changes still here.
    private func leave(then go: @escaping () -> Void) {
        if editor.saving || deleting { return }
        focus = nil
        guard editor.changed else {
            go()
            return
        }
        afterLeaving = go
        askingToLeave = true
    }

    private func save() {
        focus = nil
        let wasNew = editor.isNew
        model.idle.touch()
        Task {
            let result = await editor.save(model, items: items)
            if result.saved {
                Haptics.success()
                items.showToast(wasNew ? "Item added" : "Saved")
                dismiss()
            } else if let text = result.message {
                Haptics.error()
                message = text
            } else if editor.firstProblem != nil {
                // A field says why: it comes into view, and VoiceOver reads it out (it would not be come across by itself).
                Haptics.error()
                refusals += 1
                UIAccessibility.post(notification: .announcement, argument: editor.firstProblemText)
            }
        }
    }

    /// The card each field is in, by its title.
    private static func card(of field: ItemEditorField) -> String {
        switch field {
        case .name, .price, .desc: return "Details"
        case .sale: return "Sale"
        case .cost: return "Cost"
        case .code, .stock, .restock: return "Item tracking"
        case .optionName, .optionChoices: return "Options"
        }
    }

    private func delete() {
        let asked = Date()
        deleting = true
        model.idle.touch()
        Task {
            let problem = await editor.delete(model, items: items)
            if let problem {
                Haptics.error()
                // Two alerts cannot be up at once: the server's words wait until the question has gone.
                await ItemsAlerts.settled(since: asked)
                deleting = false
                message = problem
            } else {
                deleting = false
                Haptics.success()
                items.showToast("Deleted")
                dismiss()
            }
        }
    }

    /// The website's Scan inside the app: the camera reads the barcode, and the code goes in as it was read (the server tidies it).
    private func scan() {
        focus = nil
        Task {
            guard let read = await BarcodeScan.scanOnce() else { return }
            let code = String(read.trimmed.prefix(64))
            guard !code.isEmpty else { return }
            editor.draft.code = code
            editor.codeProblem = ""
        }
    }

    /// A photo chosen in the library: read, then prepared and uploaded the way the website does.
    private func usePhoto(_ pick: PhotosPickerItem) {
        let picked = Date()
        loadingPhoto = true
        Task {
            let data = try? await pick.loadTransferable(type: Data.self)
            loadingPhoto = false
            var problem: String?
            if let data {
                problem = await editor.setPhoto(data, model: model)
            } else {
                // The photo itself could not be fetched (its original is in iCloud and the phone is offline, for example):
                // that is not the same as choosing something that is not a picture.
                problem = "We could not load that photo. Check your connection and try again."
            }
            if let problem {
                Haptics.error()
                // Nothing can come up while the photo picker is still closing.
                await ItemsAlerts.settled(since: picked, wait: 0.6)
                message = problem
            }
        }
    }
}
