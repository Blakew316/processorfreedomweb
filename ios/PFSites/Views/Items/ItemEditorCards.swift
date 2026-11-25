import SwiftUI
import UIKit

// The white cards of the item editor (the owner's photos 29644fdd, 82292ed3, 26f86814, 904683d8, 3900c774, 746d143c, ebd20704,
// 6ab446e2 and 20d06940), measured from the photos (3 px = 1 pt). Every value is the item's own, as the server keeps it
// (server/app.js toItem); what Processor Freedom does not do (services, point of sale devices, age checks, SKUs apart from the
// product code, non-revenue items, putting one item on a menu by itself) stays where the photos show it, greyed.

/// The fields of the item editor that take the keyboard.
enum ItemEditorField: Hashable {
    case name, price, desc, sale, cost, code, stock, restock
    case optionName(UUID), optionChoices(UUID)
}

/// Keeps typed text within what the server keeps, as the website's maxlength does.
struct ItemsLimit: ViewModifier {
    @Binding var text: String
    let most: Int

    func body(content: Content) -> some View {
        content.onChange(of: text) { _, typed in
            if typed.count > most { text = String(typed.prefix(most)) }
        }
    }
}

/// Keeps only digits, at most `limit` of them (quantities and percents, like the website's number boxes).
struct ItemsDigits: ViewModifier {
    @Binding var text: String
    let limit: Int

    func body(content: Content) -> some View {
        content.onChange(of: text) { _, typed in
            let digits = typed.digits(limit: limit)
            if digits != typed { text = digits }
        }
    }
}

/// A choice in a drop-down's menu, ticked when it is the one chosen.
struct ItemsMenuChoice: View {
    let title: String
    let chosen: Bool

    var body: some View {
        if chosen {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }
}

// MARK: - Details

/// "Details" (photos 29644fdd to 904683d8): the type (always an item here), "Show on POS" greyed and off as the website shows it,
/// the name, the price and its type, the item's colour, the age check greyed, then "Online ordering" with the photo and the
/// description customers see.
struct ItemDetailsCard: View {
    let editor: ItemEditorModel
    var focus: FocusState<ItemEditorField?>.Binding
    let photoBusy: Bool
    let choosePhoto: () -> Void

    var body: some View {
        ItemsCard(title: "Details", note: "Enter basic item details for both POS and online.", bottom: 26, ruleGap: 14.9) {
            VStack(alignment: .leading, spacing: 0) {
                typeSection
                deviceSection
                priceSection
                lookSection
                onlineSection
            }
        }
    }

    /// "*Required", then the type: always an item here (services are the bookable services of Online booking).
    private var typeSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Each line where the photo has it, counted from the card's top edge: "*Required" at 153 pt, the heading at 201 pt,
            // the paragraph's first line at 240 pt, "Change type" at 342 pt, the radio buttons at 369 pt and 471 pt.
            required
                .padding(.top, 27.8)
            Text("Service or item type*")
                .pfFont(15, .semibold)
                .foregroundStyle(ItemsLook.grey)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 29.3)
            Text("This is set as an item, which is best for physical goods or products that don't need to be offered as appointments.")
                .pfFont(16)
                .foregroundStyle(ItemsLook.grey)
                .lineSpacing(6.9)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 20)
            Text("Change type")
                .pfFont(16)
                .foregroundStyle(ItemsLook.grey)
                .padding(.top, 30.8)
            ItemsRadioRow(label: "Service", note: "Best for anything you want to be bookable on your appointment calendar or online by customers.", on: false, greyed: true)
                .padding(.top, 21.7)
            ItemsRadioRow(label: "Item", note: "Best for physical goods or products that don't need to be offered as appointments.", on: true)
                .padding(.top, 19.8)
        }
    }

    /// "On device": point of sale devices are not available yet, so "Show on POS" is greyed and off, as the website shows it.
    /// Then the name.
    private var deviceSection: some View {
        @Bindable var e = editor
        return VStack(alignment: .leading, spacing: 0) {
            ItemsHeading(text: "On device")
                .padding(.top, 38.1)
            ItemsSwitchRow(label: "Show on POS", on: .constant(false), greyed: true, dotted: true, inset: 2)
                .padding(.top, 39.4)
            ItemsField(label: "Name*", problem: editor.nameProblem, focused: focus.wrappedValue == .name, tap: { focus.wrappedValue = .name }) {
                TextField("", text: $e.draft.name)
                    .focused(focus, equals: .name)
                    .submitLabel(.done)
                    .accessibilityLabel("Name")
                    .modifier(ItemsLimit(text: $e.draft.name, most: 120))
                    .onChange(of: editor.draft.name) { _, _ in editor.nameProblem = "" }
            }
            .id(ItemEditorField.name)
            .padding(.top, 33.1)
        }
    }

    /// The price (greyed and empty for a price entered at the time of sale) and its type.
    private var priceSection: some View {
        @Bindable var e = editor
        return VStack(alignment: .leading, spacing: 0) {
            ItemsField(label: "Price*", problem: editor.priceProblem, greyed: editor.draft.variable, focused: focus.wrappedValue == .price,
                       tap: { focus.wrappedValue = .price }) {
                if editor.draft.variable {
                    Text("$0.00")
                        .foregroundStyle(ItemsLook.greyedFaint)
                        .accessibilityLabel("No price. The price is entered at the time of sale.")
                } else {
                    HStack(spacing: 0) {
                        Text("$")
                            .foregroundStyle(editor.draft.priceText.isEmpty ? ItemsLook.placeholder : Color.primary)
                            .accessibilityHidden(true)
                        TextField("", text: $e.draft.priceText, prompt: Text("0.00").foregroundStyle(ItemsLook.placeholder))
                            .keyboardType(.decimalPad)
                            .focused(focus, equals: .price)
                            .accessibilityLabel("Price in dollars")
                            .onChange(of: editor.draft.priceText) { _, _ in editor.priceProblem = "" }
                    }
                }
            }
            .id(ItemEditorField.price)
            .padding(.top, 33.7)
            ItemsDropdown(label: "Price type", value: editor.draft.variable ? "Variable" : "Fixed") {
                Button {
                    editor.setVariable(false)
                } label: {
                    ItemsMenuChoice(title: "Fixed", chosen: !editor.draft.variable)
                }
                Button {
                    editor.setVariable(true)
                } label: {
                    ItemsMenuChoice(title: "Variable", chosen: editor.draft.variable)
                }
                // Clover's price per unit (by weight or length): Processor Freedom sells items at a fixed or a variable price.
                Button("Per unit") {}
                    .disabled(true)
            }
            .padding(.top, 33.7)
        }
    }

    /// The item's colour (none, or one of the website's colours) and the age check Processor Freedom does not have, greyed.
    private var lookSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            ItemsDropdown(label: "Item color", value: ItemColors.name(editor.draft.color)) {
                colorChoices
            } leading: {
                if let colour = ItemColors.uiColor(editor.draft.color) {
                    Circle()
                        .fill(Color(uiColor: colour))
                        .frame(width: 16, height: 16)
                        .accessibilityHidden(true)
                }
            }
            .padding(.top, 33.7)
            ItemsCheckRow(label: "This is an age-restricted item", note: "This item requires additional confirmation or approval during the item fulfillment process. For example, alcoholic beverages.", on: false, greyed: true)
                .padding(.top, 30.7)
        }
    }

    @ViewBuilder
    private var colorChoices: some View {
        Button {
            editor.draft.color = ""
        } label: {
            ItemsMenuChoice(title: "None", chosen: editor.draft.color.isEmpty)
        }
        ForEach(ItemColors.all, id: \.hex) { colour in
            Button {
                editor.draft.color = colour.hex
            } label: {
                Label {
                    Text(colour.name)
                } icon: {
                    Image(uiImage: swatch(colour.hex))
                }
            }
        }
        if !editor.draft.color.isEmpty && !ItemColors.all.contains(where: { $0.hex == editor.draft.color.lowercased() }) {
            // A colour set some other way stays as it is until another is chosen.
            Button {} label: {
                Label {
                    Text(ItemColors.name(editor.draft.color))
                } icon: {
                    Image(uiImage: swatch(editor.draft.color))
                }
            }
        }
    }

    /// "Online ordering": the item's photo and the description customers see.
    private var onlineSection: some View {
        @Bindable var e = editor
        return VStack(alignment: .leading, spacing: 0) {
            ItemsHeading(text: "Online ordering", color: Color.primary, dotted: true)
                .padding(.top, 29.1)
            ItemPhotoBox(image: editor.draft.image, busy: photoBusy || editor.uploading, choose: choosePhoto) {
                editor.draft.image = ""
            }
            .padding(.top, 41.3)
            ItemsField(label: "Description", focused: focus.wrappedValue == .desc, tap: { focus.wrappedValue = .desc }) {
                TextField("", text: $e.draft.desc, axis: .vertical)
                    .lineLimit(2...8)
                    .focused(focus, equals: .desc)
                    .accessibilityLabel("Description")
                    .modifier(ItemsLimit(text: $e.draft.desc, most: 500))
            }
            .padding(.top, 34)
        }
    }

    /// "*Required", its small asterisk sitting low and tight against the R, as in the photo.
    private var required: some View {
        HStack(alignment: .firstTextBaseline, spacing: -0.8) {
            Text("*")
                .baselineOffset(-1.5)
                .pfFont(11)
            Text("Required")
                .pfFont(16)
        }
        .foregroundStyle(ItemsLook.grey)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fields marked with an asterisk are required")
    }

    /// A round swatch of a colour for the colour menu (drawn in its own colour, which menus keep).
    private func swatch(_ hex: String) -> UIImage {
        let colour = ItemColors.uiColor(hex) ?? .clear
        let base = UIImage(systemName: "circle.fill") ?? UIImage()
        return base.withTintColor(colour, renderingMode: .alwaysOriginal)
    }
}

/// The photo box under "Online ordering" (photo 904683d8: 224 pt, a 2 pt grey border, the picture icon), or the item's photo.
/// Tapping it chooses a photo; a photo can be replaced or removed, as on the website.
struct ItemPhotoBox: View {
    let image: String
    let busy: Bool
    let choose: () -> Void
    let remove: () -> Void

    var body: some View {
        Group {
            if image.isEmpty {
                Button(action: choose) {
                    box
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Add a photo")
            } else {
                Menu {
                    Button(action: choose) {
                        Label("Replace", systemImage: "photo.on.rectangle")
                    }
                    Button(role: .destructive, action: remove) {
                        Label("Remove", systemImage: "trash")
                    }
                } label: {
                    box
                }
                .accessibilityLabel("Photo")
            }
        }
        .disabled(busy)
    }

    private var box: some View {
        ZStack {
            ItemsLook.imageFill
            if image.isEmpty {
                icon
            } else {
                AsyncImage(url: Config.url(image)) { phase in
                    if let picture = phase.image {
                        picture
                            .resizable()
                            .scaledToFill()
                    } else if phase.error != nil {
                        icon
                    } else {
                        ProgressView()
                    }
                }
            }
            if busy {
                Color.black.opacity(0.06)
                ProgressView()
                    .controlSize(.large)
            }
        }
        .frame(width: 224, height: 224)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(ItemsLook.line, lineWidth: 2)
        }
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var icon: some View {
        Image(systemName: "photo")
            .font(.system(size: 18, weight: .light))
            .foregroundStyle(ItemsLook.grey)
            .accessibilityHidden(true)
    }
}

// MARK: - The website's fields the photos do not show

/// The sale, percent off (the website's "Sale, percent off", 0 to 90). A variable price has no sale, as on the website.
struct ItemSaleCard: View {
    let editor: ItemEditorModel
    var focus: FocusState<ItemEditorField?>.Binding

    var body: some View {
        @Bindable var e = editor
        ItemsCard(title: "Sale", note: "Put this item on sale for a percent off its price.", bottom: 24) {
            ItemsField(label: "Sale, percent off",
                       note: editor.draft.variable ? "The price is entered at the time of sale." : editor.saleLine,
                       greyed: editor.draft.variable,
                       focused: focus.wrappedValue == .sale,
                       tap: { focus.wrappedValue = .sale }) {
                if editor.draft.variable {
                    Text("0")
                        .foregroundStyle(ItemsLook.greyedFaint)
                } else {
                    HStack(spacing: 0) {
                        TextField("", text: $e.draft.saleText, prompt: Text("0").foregroundStyle(ItemsLook.placeholder))
                            .keyboardType(.numberPad)
                            .focused(focus, equals: .sale)
                            .fixedSize(horizontal: true, vertical: false)
                            .accessibilityLabel("Sale, percent off")
                            .modifier(ItemsDigits(text: $e.draft.saleText, limit: 2))
                        Text("%")
                            .foregroundStyle(editor.draft.saleText.isEmpty ? ItemsLook.placeholder : Color.primary)
                            .accessibilityHidden(true)
                    }
                }
            }
            .padding(.top, 34)
        }
    }
}

/// "Charge sales tax", the website's switch.
struct ItemTaxCard: View {
    let editor: ItemEditorModel

    var body: some View {
        @Bindable var e = editor
        ItemsCard(title: "Sales tax", note: "Choose whether this item is charged sales tax.", bottom: 24) {
            ItemsSwitchRow(label: "Charge sales tax", on: $e.draft.taxable)
                .padding(.top, 32)
        }
    }
}

/// The printer label the item goes with (the business's printer labels, or none).
struct ItemLabelCard: View {
    let editor: ItemEditorModel
    let labels: [String]

    var body: some View {
        let current = editor.draft.label
        let choices = labels + (current.isEmpty || labels.contains(current) ? [] : [current])
        ItemsCard(title: "Printer label", note: "Assign this item to one of your printer labels.", bottom: 24) {
            ItemsDropdown(label: "Printer label", value: current.isEmpty ? "None" : current) {
                Button {
                    editor.draft.label = ""
                } label: {
                    ItemsMenuChoice(title: "None", chosen: current.isEmpty)
                }
                ForEach(choices, id: \.self) { name in
                    Button {
                        editor.draft.label = name
                    } label: {
                        ItemsMenuChoice(title: name, chosen: current == name)
                    }
                }
            }
            .padding(.top, 34)
        }
    }
}

/// The business's modifier groups, each one ticked when the item uses it (the website's list, with how many choices each has).
struct ItemModsCard: View {
    let editor: ItemEditorModel
    let groups: [ItemsSettings.ModifierGroup]

    var body: some View {
        ItemsCard(title: "Modifier groups", note: "Use modifier groups to let customers customize this item.", bottom: 24) {
            VStack(alignment: .leading, spacing: 22) {
                if groups.isEmpty {
                    Text("You do not have any modifier groups")
                        .pfFont(16)
                        .foregroundStyle(ItemsLook.grey)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    ForEach(groups) { group in
                        row(group)
                    }
                }
            }
            .padding(.top, 32)
        }
    }

    private func row(_ group: ItemsSettings.ModifierGroup) -> some View {
        let on = editor.draft.mods.contains(group.id)
        return Button {
            editor.toggleMod(group.id)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                ItemsCheckbox(on: on, border: ItemsLook.soft)
                    .padding(.top, 1.3)
                VStack(alignment: .leading, spacing: 4) {
                    Text(group.name)
                        .pfFont(16.5)
                        .foregroundStyle(Color.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(group.choices) choice\(group.choices == 1 ? "" : "s")")
                        .pfFont(14)
                        .foregroundStyle(ItemsLook.soft)
                }
                Spacer(minLength: 0)
            }
            .padding(.leading, 4)
            // A taller place to tap than the two lines themselves, without moving anything.
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -6)
        .accessibilityElement(children: .combine)
        .accessibilityValue(on ? "Checked" : "Not checked")
    }
}

/// The item's own options (sizes, add-ons) with their choices, one per line, as the website edits them.
struct ItemOptionsCard: View {
    let editor: ItemEditorModel
    var focus: FocusState<ItemEditorField?>.Binding

    var body: some View {
        ItemsCard(title: "Options", note: "Use options to offer sizes or add-ons that customers choose from.", bottom: 24) {
            VStack(alignment: .leading, spacing: 20) {
                ForEach(editor.draft.options) { option in
                    ItemOptionBox(option: binding(option.id), focus: focus) {
                        focus.wrappedValue = nil
                        withAnimation(.snappy) { editor.removeOption(option.id) }
                    }
                }
                Button {
                    withAnimation(.snappy) { editor.addOption() }
                } label: {
                    Label(editor.draft.options.isEmpty ? "Add sizes or add-ons" : "Add another option", systemImage: "plus")
                }
                .buttonStyle(ItemsPillStyle(kind: .grey, height: 44, size: 16, weight: .medium))
                .disabled(editor.draft.options.count >= 12)
            }
            .padding(.top, 32)
        }
    }

    /// The option with this id, looked up each time, so removing one never leaves a field holding a stale place in the list.
    private func binding(_ id: UUID) -> Binding<ItemOptionDraft> {
        Binding(
            get: { editor.draft.options.first(where: { $0.id == id }) ?? ItemOptionDraft(name: "", required: false, multi: false) },
            set: { changed in
                if let index = editor.draft.options.firstIndex(where: { $0.id == id }) { editor.draft.options[index] = changed }
            }
        )
    }
}

/// One option: its name, its choices one per line ("Large +1.50"), whether one must be chosen and whether several may be.
struct ItemOptionBox: View {
    @Binding var option: ItemOptionDraft
    var focus: FocusState<ItemEditorField?>.Binding
    let remove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom, spacing: 10) {
                ItemsField(label: "Option name", focused: focus.wrappedValue == .optionName(option.id),
                           tap: { focus.wrappedValue = .optionName(option.id) }) {
                    TextField("", text: $option.name, prompt: Text("e.g. Size").foregroundStyle(ItemsLook.placeholder))
                        .focused(focus, equals: .optionName(option.id))
                        .accessibilityLabel("Option name")
                        .modifier(ItemsLimit(text: $option.name, most: 60))
                }
                Button(action: remove) {
                    Image(systemName: "trash")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(Color.primary)
                        .frame(width: 48, height: 48)
                        .background(ItemsLook.control, in: Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove option")
            }
            ItemsField(label: "Choices, one per line", focused: focus.wrappedValue == .optionChoices(option.id),
                       tap: { focus.wrappedValue = .optionChoices(option.id) }) {
                TextField("", text: $option.choicesText, prompt: Text("Small\nLarge +1.50").foregroundStyle(ItemsLook.placeholder), axis: .vertical)
                    .lineLimit(3...12)
                    .focused(focus, equals: .optionChoices(option.id))
                    .accessibilityLabel("Choices, one per line")
                    .modifier(ItemsLimit(text: $option.choicesText, most: 4000))
            }
            .padding(.top, 20)
            ItemsSwitchRow(label: "Must choose", on: $option.required)
                .padding(.top, 22)
            ItemsSwitchRow(label: "Pick several", on: $option.multi)
                .padding(.top, 18)
        }
        .padding(14)
        .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(ItemsLook.line, lineWidth: 1)
        }
    }
}

// MARK: - Categories

/// "Categories" (photo 3900c774). A Processor Freedom item is in exactly one category: "+" chooses it (it replaces the one the item
/// had), and Select lets the person choose its row and take it off (saved like that, the server puts the item back in its
/// default category). Without one, the photo's empty state.
struct ItemCategoriesCard: View {
    let editor: ItemEditorModel
    let assign: () -> Void

    @State private var selecting = false
    @State private var checked = false

    var body: some View {
        let name = editor.draft.category
        ItemsCard(title: "Categories", note: "Use categories to make finding items easier for your staff and enhance your sales reports.",
                  bottom: name.isEmpty ? 44 : 13) {
            VStack(alignment: .leading, spacing: 0) {
                toolRow(has: !name.isEmpty)
                    .padding(.top, 32)
                if name.isEmpty {
                    emptyState
                } else {
                    table(name)
                        .padding(.top, 24)
                }
            }
        }
        // The card grows and shrinks between its table and its empty state, never jumps.
        .animation(.snappy(duration: 0.25), value: name.isEmpty)
        .onChange(of: name) { _, now in
            if now.isEmpty {
                selecting = false
                checked = false
            }
        }
    }

    /// The brand-blue "+" and the grey Select pill; while selecting, the ⋮ with Remove and the darker Cancel pill.
    private func toolRow(has: Bool) -> some View {
        HStack(spacing: 8) {
            Spacer(minLength: 0)
            if selecting {
                ItemsKebab(label: "Actions for the chosen category", disabled: !checked) {
                    Button(role: .destructive) {
                        editor.removeCategory()
                        selecting = false
                        checked = false
                    } label: {
                        Label("Remove", systemImage: "minus.circle")
                    }
                }
                Button("Cancel") {
                    withAnimation(.snappy(duration: 0.25)) {
                        selecting = false
                        checked = false
                    }
                }
                .buttonStyle(ItemsPillStyle(kind: .darkGrey, width: 100))
            } else {
                Button(action: assign) {
                    ItemsPlus()
                }
                .buttonStyle(ItemsCapsuleStyle(fill: Theme.blue))
                .accessibilityLabel("Assign categories")
                Button("Select") {
                    withAnimation(.snappy(duration: 0.25)) { selecting = true }
                }
                .buttonStyle(ItemsPillStyle(kind: .grey, width: 100))
                .disabled(!has)
            }
        }
        .padding(.trailing, 18)
    }

    private var emptyState: some View {
        VStack(spacing: 0) {
            Text("You have not assigned any categories to this item")
                .pfFont(24.5, .bold, relativeTo: .title2)
                .foregroundStyle(ItemsLook.grey)
                .multilineTextAlignment(.center)
                .lineSpacing(2.7)
                .fixedSize(horizontal: false, vertical: true)
            Text("Select 'Assign categories' above to begin")
                .pfFont(16.5)
                .foregroundStyle(ItemsLook.grey)
                .multilineTextAlignment(.center)
                .lineSpacing(6.3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 47.7)
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity)
        .padding(.top, 130)
    }

    /// The item's category in the table the Menus card uses, with a checkbox on each row while selecting.
    private func table(_ name: String) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 16.3) {
                if selecting { checkbox }
                Text("Category name")
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
            }
            .padding(.leading, 16)
            .padding(.trailing, 13)
            .frame(minHeight: 71)
            ItemsHairline(color: ItemsLook.control)
            HStack(spacing: 16.3) {
                if selecting { checkbox }
                Text(name)
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.leading, 16)
            .padding(.trailing, 13)
            .padding(.vertical, 12)
            .frame(minHeight: 71)
            .contentShape(Rectangle())
            .onTapGesture {
                if selecting { checked.toggle() }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(selecting ? .isButton : [])
            .accessibilityValue(selecting ? (checked ? "Selected" : "Not selected") : "")
        }
        .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(ItemsLook.control, lineWidth: 1)
        }
    }

    private var checkbox: some View {
        Button {
            checked.toggle()
        } label: {
            ItemsCheckbox(on: checked, border: ItemsLook.soft)
                .frame(width: 30, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, -7)
        .accessibilityLabel("Select")
        .accessibilityValue(checked ? "Selected" : "Not selected")
    }
}

// MARK: - Cost

/// "Cost" (photo 746d143c): the item's cost (empty for none), the revenue class (the business's, or none), and the non-revenue
/// setting Processor Freedom does not have, greyed.
struct ItemCostCard: View {
    let editor: ItemEditorModel
    var focus: FocusState<ItemEditorField?>.Binding
    let classes: [String]

    var body: some View {
        @Bindable var e = editor
        let current = editor.draft.revclass
        let choices = classes + (current.isEmpty || classes.contains(current) ? [] : [current])
        ItemsCard(title: "Cost", note: "Enter the cost of this item to enable gross profit margin in reports.", kind: .ruled, bottom: 17.7) {
            VStack(alignment: .leading, spacing: 0) {
                // From the photo, under the description's last line: "Item cost" 50 pt, the heading 50 pt under the box, its
                // drop-down's label 55 pt under the heading.
                ItemsField(label: "Item cost", problem: editor.costProblem, focused: focus.wrappedValue == .cost, tap: { focus.wrappedValue = .cost }) {
                    HStack(spacing: 0) {
                        Text("$")
                            .foregroundStyle(editor.draft.costText.isEmpty ? ItemsLook.placeholder : Color.primary)
                            .accessibilityHidden(true)
                        TextField("", text: $e.draft.costText, prompt: Text("0.00").foregroundStyle(ItemsLook.placeholder))
                            .keyboardType(.decimalPad)
                            .focused(focus, equals: .cost)
                            .accessibilityLabel("Item cost in dollars")
                            .onChange(of: editor.draft.costText) { _, _ in editor.costProblem = "" }
                    }
                }
                .id(ItemEditorField.cost)
                .padding(.top, 32.6)
                ItemsHeading(text: "Revenue class", color: Color.primary, dotted: true)
                    .padding(.top, 32)
                ItemsDropdown(label: "Revenue class", value: current.isEmpty ? "None" : current) {
                    Button {
                        editor.draft.revclass = ""
                    } label: {
                        ItemsMenuChoice(title: "None", chosen: current.isEmpty)
                    }
                    ForEach(choices, id: \.self) { name in
                        Button {
                            editor.draft.revclass = name
                        } label: {
                            ItemsMenuChoice(title: name, chosen: current == name)
                        }
                    }
                }
                .padding(.top, 31)
                ItemsCheckRow(label: "This is a non-revenue item", on: false, greyed: true, bold: false, dotted: true, gap: 28.3)
                    .padding(.top, 31)
            }
        }
    }
}

// MARK: - Menus

/// "Menus" (photo ebd20704). Processor Freedom's menus are made of categories, so the item is on each menu that includes its
/// category, at its own price. A menu's name opens the website's Menus page. One item cannot be put on a menu by itself, so
/// "+ Assign Menus" and the checkboxes are greyed.
struct ItemMenusCard: View {
    let menus: [ItemsSettings.OnlineMenu]
    let price: String
    let openMenus: () -> Void

    var body: some View {
        ItemsCard(title: "Menus", note: "Use menus to sell items on different platforms for different prices.", kind: .side, bottom: 13) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer(minLength: 0)
                    Button("+ Assign Menus") {}
                        .buttonStyle(ItemsPillStyle(kind: .brand, height: 48, size: 16, weight: .medium, disabledFill: ItemsLook.control))
                        .disabled(true)
                        .accessibilityValue("Not available yet")
                }
                // The pill 29.7 pt under the description's last line, and the table 24 pt under the pill, as in the photo.
                .padding(.top, 25.6)
                table
                    .padding(.top, 24)
            }
        }
    }

    /// The price column is 54 pt wide, 10 pt in from the table's end (x = 266 to 320 pt in the photo): its heading centred on two
    /// lines, the price starting at its left edge and kept whole on one line.
    private var table: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16.3) {
                ItemsCheckbox(on: false, greyed: true)
                Text("Menu name")
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // Its two lines 24 pt apart, as in the photo.
                Text("Menu price")
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4.9)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(width: 54, alignment: .center)
            }
            .padding(.leading, 16)
            .padding(.trailing, 10)
            .padding(.vertical, 10)
            .frame(minHeight: 71)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ForEach(menus) { menu in
                ItemsHairline(color: ItemsLook.control)
                HStack(spacing: 16.3) {
                    ItemsCheckbox(on: false, greyed: true)
                    Button(action: openMenus) {
                        // A taller place to tap than the name itself, without moving anything.
                        Text(menu.name)
                            .pfFont(16)
                            .foregroundStyle(Theme.blue)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 12)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, -12)
                    .accessibilityHint("Opens Menus")
                    Text(price)
                        .pfFont(16)
                        .foregroundStyle(Color.primary)
                        .frame(width: 54, alignment: .leading)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .padding(.leading, 16)
                .padding(.trailing, 10)
                .padding(.vertical, 10)
                .frame(minHeight: 71)
            }
        }
        .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(ItemsLook.control, lineWidth: 1)
        }
    }
}

// MARK: - Item tracking

/// "Item tracking" (photos 6ab446e2 and 20d06940): the product code with Scan (the barcode number or the business's own SKU, so
/// the separate SKU box is greyed), then stock: Processor Freedom always counts it (an order takes it down, 0 is sold out, and
/// the daily refill puts it back), so "Automatically manage availability" is the chosen way, with the quantity in stock and the
/// morning refill under it; then "Available" (the website's "Available to order").
struct ItemTrackingCard: View {
    let editor: ItemEditorModel
    var focus: FocusState<ItemEditorField?>.Binding
    let scan: () -> Void

    var body: some View {
        ItemsCard(title: "Item tracking", note: "Select how you want to manage item stock and availability.", bottom: 21) {
            VStack(alignment: .leading, spacing: 0) {
                codeSection
                stockSection
                availabilitySection
            }
        }
    }

    private static let codePrompt = "Scan or type the barcode number or SKU"

    /// The product code, with Scan inside the field as on the website, and the SKU box Processor Freedom does not have.
    private var codeSection: some View {
        @Bindable var e = editor
        return VStack(alignment: .leading, spacing: 0) {
            ItemsField(label: "Product code", problem: editor.codeProblem,
                       note: "Scanning this code on the PF Sites app’s Sale screen finds this item.",
                       focused: focus.wrappedValue == .code,
                       tap: { focus.wrappedValue = .code }) {
                ZStack(alignment: .leading) {
                    // The website's words are longer than the room beside Scan: shown whole on two lines instead of cut short.
                    // (The field keeps them as its own unseen prompt, which is what VoiceOver reads.)
                    if editor.draft.code.isEmpty {
                        Text(Self.codePrompt)
                            .pfFont(14)
                            .foregroundStyle(ItemsLook.placeholder)
                            .lineLimit(2)
                            .minimumScaleFactor(0.85)
                            .fixedSize(horizontal: false, vertical: true)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
                    TextField("", text: $e.draft.code, prompt: Text(Self.codePrompt).foregroundStyle(Color.clear))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused(focus, equals: .code)
                        .accessibilityLabel("Product code")
                        .modifier(ItemsLimit(text: $e.draft.code, most: 64))
                        .onChange(of: editor.draft.code) { _, _ in editor.codeProblem = "" }
                }
            } trailing: {
                Button(action: scan) {
                    // 36 pt tall so the box stays 48 pt like the others; taps count on 44 pt.
                    HStack(spacing: 5) {
                        Image(systemName: "barcode.viewfinder")
                            .font(.system(size: 17, weight: .regular))
                        Text("Scan")
                            .pfFont(15, .medium)
                    }
                    .foregroundStyle(Theme.blue)
                    .padding(.horizontal, 6)
                    .frame(minHeight: 36)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -4)
                .accessibilityLabel("Scan")
            }
            .id(ItemEditorField.code)
            .padding(.top, 37.7)
            ItemsField(label: "SKU", greyed: true) {
                Text("")
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("SKU")
            .accessibilityValue("Not available yet")
            .padding(.top, 33.9)
        }
    }

    /// "Stock": counted automatically, with the quantity in stock and the morning refill under the chosen way.
    private var stockSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // From the photos: "Stock" 59 pt under the SKU box, the first radio button 45 pt under it, the second 48 pt
            // under the first.
            ItemsHeading(text: "Stock")
                .padding(.top, 41)
            ItemsRadioRow(label: "Manually manage availability", on: false, greyed: true)
                .padding(.top, 38.8)
            ItemsRadioRow(label: "Automatically manage availability", on: true, extra: { stockFields })
                .padding(.top, 28.7)
        }
    }

    private var stockFields: some View {
        @Bindable var e = editor
        return VStack(alignment: .leading, spacing: 0) {
            ItemsField(label: "In stock", problem: editor.stockProblem, focused: focus.wrappedValue == .stock, tap: { focus.wrappedValue = .stock }) {
                TextField("", text: $e.draft.stockText, prompt: Text("0").foregroundStyle(ItemsLook.placeholder))
                    .keyboardType(.numberPad)
                    .focused(focus, equals: .stock)
                    .accessibilityLabel("In stock")
                    .modifier(ItemsDigits(text: $e.draft.stockText, limit: 6))
                    // Typing takes the message away. The count the server just put in the field (sold while the editor was open)
                    // is not typing: its message stays until the person changes the number.
                    .onChange(of: editor.draft.stockText) { _, typed in
                        if typed != String(editor.seenStock) { editor.stockProblem = "" }
                    }
            } trailing: {
                HStack(spacing: 6) {
                    step("minus", by: -1, label: "One fewer")
                    step("plus", by: 1, label: "One more")
                }
            }
            .id(ItemEditorField.stock)
            .padding(.top, 24)
            ItemsField(label: "Refill every morning to",
                       note: "For things you make fresh each day. The quantity goes back to this number every morning. Leave empty to keep counting down.",
                       focused: focus.wrappedValue == .restock,
                       tap: { focus.wrappedValue = .restock }) {
                TextField("", text: $e.draft.restockText, prompt: Text("Off").foregroundStyle(ItemsLook.placeholder))
                    .keyboardType(.numberPad)
                    .focused(focus, equals: .restock)
                    .accessibilityLabel("Refill every morning to")
                    .modifier(ItemsDigits(text: $e.draft.restockText, limit: 6))
            }
            .padding(.top, 24)
        }
    }

    /// "Availability": the website's "Available to order".
    private var availabilitySection: some View {
        @Bindable var e = editor
        return VStack(alignment: .leading, spacing: 0) {
            // The switch 12 pt in from the card's text and 33 pt under the heading, as in the photo.
            ItemsHeading(text: "Availability")
                .padding(.top, 30.6)
            ItemsSwitchRow(label: "Available", on: $e.draft.available, inset: 0.6)
                .padding(.leading, 11.4)
                .padding(.top, 28.1)
        }
    }

    private func step(_ symbol: String, by: Int, label: String) -> some View {
        Button {
            Haptics.light()
            editor.bumpStock(by)
        } label: {
            // A 34 pt circle that takes taps on 40 x 44 pt, without moving anything.
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.primary)
                .frame(width: 34, height: 34)
                .background(ItemsLook.control, in: Circle())
                .padding(.horizontal, 3)
                .padding(.vertical, 5)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, -3)
        .padding(.vertical, -5)
        .accessibilityLabel(label)
    }
}
