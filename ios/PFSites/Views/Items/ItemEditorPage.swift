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
    @State private var choosingPhoto = false
    @State private var photoPick: PhotosPickerItem?
    @State private var loadingPhoto = false
    @State private var assigningCategory = false

    init(items: ItemsModel, itemID: String?, close: @escaping () -> Void, openMenus: @escaping () -> Void) {
        self.items = items
        self.close = close
        self.openMenus = openMenus
        _editor = State(initialValue: ItemEditorModel(item: itemID.flatMap { items.item($0) }))
    }

    var body: some View {
        VStack(spacing: 0) {
            backBar
            ItemsHairline()
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
            ItemsHairline()
            bottomBar
        }
        // The grey page stops above the home indicator, as in the photos.
        .background(ItemsLook.page, ignoresSafeAreaEdges: [])
        .background(Color(.systemBackground))
        .modifier(ItemsCoverBar(close: { leave(then: close) }))
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
            HStack(spacing: 13.7) {
                Image(systemName: "arrow.left")
                    .font(.system(size: 19, weight: .regular))
                Text("Item list")
                    .pfFont(18.5, .bold)
            }
            .foregroundStyle(Color.primary)
            .padding(.leading, 25.7)
            .padding(.trailing, 16)
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("Back to Item list")
    }

    /// The item's name on one line (cut short with "…"), or the website's words for an item not made yet, with the ⋮ of an item
    /// that exists.
    private var headingRow: some View {
        HStack(spacing: 0) {
            Text(editor.heading)
                .pfFont(25, .bold, relativeTo: .title)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .truncationMode(.tail)
                .accessibilityAddTraits(.isHeader)
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
        .padding(.leading, 21)
        .padding(.trailing, 13)
        .padding(.top, 24)
    }

    /// Cancel (grey pill) and Save (brand blue once something changed).
    private var bottomBar: some View {
        HStack(spacing: 16) {
            Button("Cancel") {
                leave(then: { dismiss() })
            }
            .buttonStyle(ItemsPillStyle(kind: .grey, height: 50, size: 17, weight: .bold))
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
            .buttonStyle(ItemsPillStyle(kind: .brand, height: 50, size: 17, weight: .bold))
            .disabled(!editor.changed || editor.saving || deleting || editor.uploading || loadingPhoto)
        }
        .padding(.leading, 20)
        .padding(.trailing, 28)
        .padding(.vertical, 16)
        .background(ItemsLook.page)
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

    /// Leaves the editor (back to the list, or closing the cover), asking first when something changed.
    private func leave(then go: @escaping () -> Void) {
        focus = nil
        guard editor.changed, !editor.saving else {
            go()
            return
        }
        afterLeaving = go
        askingToLeave = true
    }

    private func save() {
        focus = nil
        let wasNew = editor.isNew
        Task {
            let result = await editor.save(model, items: items)
            if result.saved {
                Haptics.success()
                items.showToast(wasNew ? "Item added" : "Saved")
                dismiss()
            } else if let text = result.message {
                message = text
            }
        }
    }

    private func delete() {
        deleting = true
        Task {
            let problem = await editor.delete(model, items: items)
            deleting = false
            if let problem {
                message = problem
            } else {
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
        loadingPhoto = true
        Task {
            let data = try? await pick.loadTransferable(type: Data.self)
            loadingPhoto = false
            guard let data else {
                message = "Choose an image file."
                return
            }
            if let problem = await editor.setPhoto(data, model: model) {
                message = problem
            }
        }
    }
}
