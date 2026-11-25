import SwiftUI
import UIKit

/// The fields of the form that type with the keyboard.
enum CreateAppointmentFocus: Hashable {
    case search, firstName, lastName, email, phone, notes
    case service(UUID)
    case price(UUID)
}

/// Create appointment (Home → Calendar → "+"), like the owner's Clover photos: the bar keeps "Appointments" with the back button;
/// on the grey page the heading and the white cards that open and close (Customer information, Appointment details with the
/// services, date and time, extra time, items and the sums, Payment information, Notes, Appointment History); and the fixed bar at
/// the foot with the live total, Cancel and Save (pale until the form is ready). Everything works as the website's Create
/// appointment does (CreateAppointmentModel). Saving goes back to Appointments, which loads again as it appears; a problem shows
/// the server's words and keeps what was typed. A business without bookable services types what the appointment is for instead
/// of choosing it, so the form always works (no "Services are required" warning, ever).
struct CreateAppointmentScreen: View {
    var date: String? = nil
    var time: String? = nil
    var employee: String? = nil

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var form: CreateAppointmentModel
    @State private var problem: String? = nil
    /// A message to show once the sheet it came from has gone.
    @State private var pendingProblem: String? = nil
    @State private var sheet: CreateAppointmentSheet? = nil
    /// The sheet to show once the open one has finished closing (a variable-price item's price after the item list).
    @State private var nextSheet: CreateAppointmentSheet? = nil
    @State private var pickingDate = false
    @State private var pickingTime = false
    /// Find availability is reading the booked times again before it chooses one.
    @State private var finding = false
    /// A list that could not be read is being read again (Try again), one at a time.
    @State private var retrying = false
    /// The screen has left the stack (Back while a save was on its way): the answer then neither closes nor alerts anything.
    @State private var closed = false
    @FocusState private var focus: CreateAppointmentFocus?

    /// What the form is read for again: the app back in front and unlocked, and the business.
    private struct LoadKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
    }

    /// The place the page scrolls to when the customer search is typed in.
    private static let searchID = "customer-search"

    init(date: String? = nil, time: String? = nil, employee: String? = nil) {
        self.date = date
        self.time = time
        self.employee = employee
        _form = State(initialValue: CreateAppointmentModel(date: date, time: time, employee: employee))
    }

    var body: some View {
        VStack(spacing: 0) {
            page
            // While typing the keyboard takes the foot of the screen; the bar comes back with Done.
            if focus == nil {
                bottomBar
            }
        }
        .navigationTitle("Appointments")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Appointments")
                    .pfFont(19, .bold, relativeTo: .headline)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
            // Number pads have no return key: Done puts the keyboard away.
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus = nil }
            }
        }
        .toolbarVisibility(.hidden, for: .tabBar)
        .steadyNavigationBar()
        .onAppear {
            closed = false
            // Saved while this screen was out of sight (another tab came up over it): it is finished, so it closes now.
            if form.saved { dismiss() }
        }
        .onDisappear { closed = true }
        // Reads the business's services, team, customers, bookings and items as the screen opens, and again each time the app
        // comes back to the front or is unlocked; what was typed stays.
        .task(id: LoadKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
            await form.load(siteID: business.id)
        }
        .onChange(of: form.typing) { _, _ in
            model.idle.touch()
            form.limitText()
        }
        .sheet(item: $sheet, onDismiss: { sheetClosed() }) { item in
            sheetContent(item)
        }
        .alert(problem ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    // MARK: The page

    @ViewBuilder
    private var page: some View {
        if form.siteLoaded {
            ScrollViewReader { reader in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Create appointment")
                            .pfFont(24, .bold, relativeTo: .title)
                            .foregroundStyle(Color.primary)
                            .accessibilityAddTraits(.isHeader)
                            .padding(.top, 12.33)
                        VStack(spacing: 16) {
                            customerCard
                            detailsCard
                            paymentCard
                            notesCard
                            historyCard
                        }
                        .padding(.top, 20.67)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // The grey page under the bar, its top-left corner rounded like Clover's (14 pt: the photo's corner, fitted
                    // pixel by pixel).
                    .background(SettingsLook.page, in: UnevenRoundedRectangle(topLeadingRadius: 14, style: .continuous))
                }
                .scrollDismissesKeyboard(.interactively)
                // Pulling reads the business's services, team, customers, bookings and items again; what was typed stays.
                .refreshable { await pullToRefresh() }
                .scrollEdgeEffectStyle(.hard, for: .top)
                // White behind the bar and the rounded corner, grey below a short page.
                .background {
                    VStack(spacing: 0) {
                        Color(.systemBackground)
                        SettingsLook.page
                    }
                    .ignoresSafeArea()
                }
                // The customers found come up under the search, so the search goes to the top of the page while it is typed
                // in: there the keyboard leaves room for them. It goes up as the search is tapped, and again with the first
                // letter typed (a short page cannot move until the keyboard is up).
                .onChange(of: focus) { _, field in
                    if field == .search { raiseSearch(reader) }
                }
                .onChange(of: form.query.isEmpty) { _, empty in
                    if !empty, focus == .search { raiseSearch(reader) }
                }
            }
        } else if form.loadError.isEmpty {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.blue)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(SettingsLook.page)
        } else {
            VStack(spacing: 14) {
                Text(form.loadError)
                    .pfFont(17)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Try again") {
                    guard let business = model.site else { return }
                    Task { await form.retry(siteID: business.id) }
                }
                .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                .frame(maxWidth: 200)
            }
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(SettingsLook.page)
        }
    }

    private func pullToRefresh() async {
        guard let business = model.site else { return }
        await form.load(siteID: business.id)
    }

    /// Moves the customer search to the top of the page.
    private func raiseSearch(_ reader: ScrollViewProxy) {
        withAnimation(.snappy(duration: 0.25)) { reader.scrollTo(Self.searchID, anchor: .top) }
    }

    /// Reads one of the business's lists again after it could not be read; a second tap waits for the first one's answer.
    private func retry(_ read: @escaping (String) async -> Void) {
        guard let business = model.site, !retrying else { return }
        retrying = true
        Task {
            await read(business.id)
            retrying = false
        }
    }

    private func toggle(_ section: CreateAppointmentSection) {
        focus = nil
        withAnimation(.snappy(duration: 0.25)) { form.toggle(section) }
    }

    // MARK: Customer information

    private var customerCard: some View {
        CreateAppointmentCard(title: "Customer information", open: form.isOpen(.customer), gap: 40, bottom: 17, toggle: { toggle(.customer) }) {
            VStack(alignment: .leading, spacing: 0) {
                // At least 12 pt between the two, so the longer link ("Select an existing customer") stays on one line beside
                // "* Required:" on a 375 pt iPhone.
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("* Required:")
                        .pfFont(16, .bold)
                        .foregroundStyle(Color.primary)
                        .layoutPriority(1)
                    Spacer(minLength: 12)
                    // The photo's link sits 2 pt lower than "* Required:".
                    CreateAppointmentLink(title: form.newCustomer ? "Select an existing customer" : "+ Add new customer") {
                        focus = nil
                        withAnimation(.snappy(duration: 0.25)) { form.toggleNewCustomer() }
                    }
                    .offset(y: 2)
                }
                if let picked = form.customer {
                    pickedCustomer(picked)
                        .padding(.top, 26.67)
                } else if form.newCustomer {
                    newCustomerFields
                        .padding(.top, 26.67)
                } else {
                    // 12 pt of the space above the name scrolls with it when the search goes to the top of the page.
                    CreateAppointmentLabel(text: "Select customer*")
                        .padding(.top, 12)
                        .id(Self.searchID)
                        .padding(.top, 14.67)
                    searchField
                        .padding(.top, CreateAppointmentLook.labelGap)
                    searchResults
                }
            }
        }
    }

    /// The search pill: the magnifier 17 pt in, then the words 16 pt (#696969 until something is typed).
    private var searchField: some View {
        @Bindable var draft = form
        return HStack(spacing: 12.5) {
            CreateAppointmentMagnifier()
                .stroke(CreateAppointmentLook.icon, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                .frame(width: 17.5, height: 17.5)
                .accessibilityHidden(true)
            TextField("", text: $draft.query, prompt: Text("Search by email, phone or name").foregroundStyle(CreateAppointmentLook.placeholder))
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($focus, equals: .search)
                .accessibilityLabel("Select customer")
            if !form.query.isEmpty {
                // The cross is 32 pt; its tap area is 44 pt, without moving anything.
                Button {
                    form.query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                        .padding(6)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(-6)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, 17.17)
        .padding(.trailing, 14)
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .background(Capsule().fill(SettingsLook.card))
        .overlay {
            Capsule()
                .strokeBorder(focus == .search ? CreateAppointmentLook.focus : CreateAppointmentLook.field, lineWidth: focus == .search ? 2 : 1)
        }
    }

    /// Up to six customers whose name, email or phone holds what was typed; the server's words when the list could not be read,
    /// with a way to read it again.
    @ViewBuilder
    private var searchResults: some View {
        let found = form.matches
        if !found.isEmpty {
            VStack(spacing: 0) {
                ForEach(found) { person in
                    Button {
                        withAnimation(.snappy(duration: 0.25)) { form.pick(person) }
                        focus = nil
                    } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(person.name.isEmpty ? person.email : person.name)
                                .pfFont(16)
                                .foregroundStyle(Color.primary)
                                .lineLimit(1)
                            Spacer(minLength: 8)
                            Text(person.email.isEmpty ? person.phone : person.email)
                                .pfFont(14)
                                .foregroundStyle(SettingsLook.muted)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 8)
        } else if !form.query.isEmpty && !form.customersError.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(form.customersError)
                    .pfFont(14)
                    .foregroundStyle(SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if form.customersRetry {
                    CreateAppointmentLink(title: "Try again", underlined: false) {
                        retry { await form.reloadCustomers($0) }
                    }
                }
            }
            .padding(.top, 10)
        } else if !form.query.isEmpty && !form.customersLoaded {
            // The list is still being read: the wait, as Appointment History shows it, instead of the nothing that "no such
            // customer" also looks like.
            ProgressView()
                .tint(Theme.blue)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 12)
                .accessibilityLabel("Loading customers")
        }
    }

    /// The chosen customer (the website's picked box) with Change.
    private func pickedCustomer(_ picked: CreateAppointmentCustomer) -> some View {
        let contact = [picked.email, picked.phone].filter { !$0.isEmpty }.joined(separator: " · ")
        return HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(picked.name.isEmpty ? picked.email : picked.name)
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                if !contact.isEmpty {
                    Text(contact)
                        .pfFont(14)
                        .foregroundStyle(SettingsLook.muted)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            Spacer(minLength: 8)
            Button {
                withAnimation(.snappy(duration: 0.25)) { form.changeCustomer() }
            } label: {
                Text("Change")
                    .pfFont(16)
                    .foregroundStyle(Theme.blue)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Change customer")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SettingsLook.page, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    /// "+ Add new customer": First name, Last name, Email address and Phone number, as on the website.
    private var newCustomerFields: some View {
        @Bindable var draft = form
        return VStack(alignment: .leading, spacing: 0) {
            typedField("First name", text: $draft.firstName, field: .firstName, next: .lastName, kind: .givenName, keyboard: .default, capitals: .words)
            typedField("Last name", text: $draft.lastName, field: .lastName, next: .email, kind: .familyName, keyboard: .default, capitals: .words)
                .padding(.top, 24.67)
            typedField("Email address", text: $draft.email, field: .email, next: .phone, kind: .emailAddress, keyboard: .emailAddress, capitals: .never)
                .padding(.top, 24.67)
            typedField("Phone number", text: $draft.phone, field: .phone, next: nil, kind: .telephoneNumber, keyboard: .phonePad, capitals: .never)
                .padding(.top, 24.67)
        }
    }

    /// `next` is the field the keyboard's Next goes to (the keyboard closes after the last one).
    private func typedField(_ label: String, text: Binding<String>, field: CreateAppointmentFocus, next: CreateAppointmentFocus?, kind: UITextContentType, keyboard: UIKeyboardType, capitals: TextInputAutocapitalization) -> some View {
        VStack(alignment: .leading, spacing: CreateAppointmentLook.labelGap) {
            CreateAppointmentLabel(text: label)
            TextField("", text: text)
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .textContentType(kind)
                .keyboardType(keyboard)
                .textInputAutocapitalization(capitals)
                .autocorrectionDisabled()
                .submitLabel(next == nil ? .done : .next)
                .onSubmit { focus = next }
                .focused($focus, equals: field)
                .accessibilityLabel(label)
                .padding(.horizontal, CreateAppointmentFieldBox.inset)
                .modifier(CreateAppointmentFieldBox(focused: focus == field))
        }
    }

    // MARK: Appointment details

    private var detailsCard: some View {
        CreateAppointmentCard(title: "Appointment details", open: form.isOpen(.details), gap: 39.67, bottom: 15, toggle: { toggle(.details) }) {
            VStack(alignment: .leading, spacing: 0) {
                Text("*Required")
                    .pfFont(14)
                    .foregroundStyle(SettingsLook.muted)
                Text("Services*")
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                    .padding(.top, 19.33)
                ForEach(form.services) { service in
                    serviceCard(serviceBinding(service.id))
                        .padding(.top, service.id == form.services.first?.id ? 26 : 16)
                }
                Button("Add another service") {
                    focus = nil
                    withAnimation(.snappy(duration: 0.25)) { form.addService() }
                }
                .buttonStyle(CreateAppointmentPillStyle(kind: .soft, fullWidth: false))
                .padding(.top, 32)

                CreateAppointmentRule()
                    .padding(.top, 32)
                dateAndTime
                CreateAppointmentRule()
                    .padding(.top, 36)
                extraTime
                CreateAppointmentRule()
                    .padding(.top, 36)
                itemsPart
                CreateAppointmentRule()
                    .padding(.top, 34.33)
                totals
                    .padding(.top, 34.67)
            }
        }
    }

    /// One service: what it is (chosen from the business's bookable services, or typed when it has none), its price and who it is
    /// with, in a card of its own; Remove service when there are several.
    private func serviceCard(_ service: Binding<CreateAppointmentService>) -> some View {
        let current = service.wrappedValue
        return VStack(alignment: .leading, spacing: 0) {
            if form.offers.isEmpty {
                CreateAppointmentLabel(text: "What for")
                TextField("", text: service.name, prompt: Text("e.g. Table for dinner").foregroundStyle(CreateAppointmentLook.placeholder))
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
                    .textInputAutocapitalization(.sentences)
                    .submitLabel(.done)
                    .focused($focus, equals: .service(current.id))
                    .accessibilityLabel("What for")
                    .padding(.horizontal, CreateAppointmentFieldBox.inset)
                    .modifier(CreateAppointmentFieldBox(focused: focus == .service(current.id)))
                    .padding(.top, CreateAppointmentLook.labelGap)
            } else {
                CreateAppointmentLabel(text: "Service")
                Menu {
                    ForEach(form.offers) { offer in
                        Button {
                            form.choose(offer, for: current.id)
                        } label: {
                            if offer.name == current.name {
                                Label(offer.title, systemImage: "checkmark")
                            } else {
                                Text(offer.title)
                            }
                        }
                    }
                } label: {
                    CreateAppointmentDropdownLabel(value: serviceTitle(current), placeholder: current.name.isEmpty)
                }
                .accessibilityLabel("Service")
                .accessibilityValue(current.name.isEmpty ? "Choose a service" : serviceTitle(current))
                .padding(.top, CreateAppointmentLook.labelGap)
            }

            CreateAppointmentLabel(text: "Price")
                .padding(.top, 24.67)
            HStack(spacing: 0) {
                Text("$")
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
                    .accessibilityHidden(true)
                TextField("", text: service.price, prompt: Text("0").foregroundStyle(Color.primary))
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
                    .keyboardType(.decimalPad)
                    .focused($focus, equals: .price(current.id))
                    .accessibilityLabel("Price in dollars")
            }
            .padding(.horizontal, CreateAppointmentFieldBox.inset)
            .modifier(CreateAppointmentFieldBox(focused: focus == .price(current.id)))
            .padding(.top, CreateAppointmentLook.labelGap)

            CreateAppointmentLabel(text: "Employee")
                .padding(.top, 24.67)
            Menu {
                Picker("Employee", selection: service.employee) {
                    Text(CreateAppointmentModel.anyAvailable).tag("")
                    ForEach(form.employeeChoices(including: current.employee), id: \.self) { name in
                        Text(name).tag(name)
                    }
                }
            } label: {
                CreateAppointmentDropdownLabel(value: current.employee.isEmpty ? CreateAppointmentModel.anyAvailable : current.employee)
            }
            .accessibilityLabel("Employee")
            .accessibilityValue(current.employee.isEmpty ? CreateAppointmentModel.anyAvailable : current.employee)
            .padding(.top, CreateAppointmentLook.labelGap)

            if form.services.count > 1 {
                // The words are 19 pt high; their tap area is 44 pt, without moving anything.
                Button {
                    focus = nil
                    withAnimation(.snappy(duration: 0.25)) { form.removeService(current.id) }
                } label: {
                    Text("Remove service")
                        .pfFont(16, .semibold)
                        .foregroundStyle(CreateAppointmentLook.red)
                        .padding(.vertical, 12.33)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -12.33)
                .padding(.top, 20)
            }
        }
        .padding(.horizontal, 17)
        .padding(.top, 21.67)
        .padding(.bottom, 21)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay {
            CreateAppointmentLook.serviceShape
                .strokeBorder(SettingsLook.border, lineWidth: 1)
        }
    }

    /// The service with this id, looked up on every read and write, so a card that is going away (Remove service while one of its
    /// fields is still typing) can never read or write another card's place in the list.
    private func serviceBinding(_ id: UUID) -> Binding<CreateAppointmentService> {
        Binding(
            get: { form.services.first(where: { $0.id == id }) ?? CreateAppointmentService() },
            set: { changed in
                if let index = form.services.firstIndex(where: { $0.id == id }) { form.services[index] = changed }
            }
        )
    }

    /// The chosen service as the website's list writes it ("Haircut · 30 min"), or "Choose a service".
    private func serviceTitle(_ service: CreateAppointmentService) -> String {
        if service.name.isEmpty { return "Choose a service" }
        return form.offer(named: service.name)?.title ?? service.name
    }

    /// Date and time*, Find availability, and the date and time on the business's clock, chosen with the iPhone's own pickers.
    private var dateAndTime: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("Date and time*")
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                    .layoutPriority(1)
                Spacer(minLength: 12)
                CreateAppointmentLink(title: "Find availability", underlined: false) {
                    focus = nil
                    findAvailability()
                }
                .disabled(finding)
                .accessibilityValue(finding ? "In progress" : "")
            }
            .padding(.top, 35.67)

            CreateAppointmentLabel(text: "Date* (mm/dd/yyyy)")
                .padding(.top, 23.67)
            Button {
                focus = nil
                pickingDate = true
            } label: {
                HStack(spacing: 8) {
                    Text(CreateAppointmentClock.shortDate(form.date))
                        .pfFont(16)
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    // The photo's #F9F9F9 box: 48 x 46 pt with 12 pt corners, filling the field from border to border.
                    CreateAppointmentCalendarGlyph()
                        .stroke(CreateAppointmentLook.icon, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                        .frame(width: 19.33, height: 19.33)
                        .frame(width: 48, height: 46)
                        .background(CreateAppointmentLook.iconBox, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .padding(.trailing, 1)
                }
                .padding(.leading, CreateAppointmentFieldBox.inset)
                .modifier(CreateAppointmentFieldBox(focused: pickingDate))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $pickingDate) {
                datePicker
            }
            .accessibilityLabel("Date")
            .accessibilityValue(CreateAppointmentClock.longDay(form.date))
            .accessibilityHint("Choose the day")
            .padding(.top, CreateAppointmentLook.labelGap)

            CreateAppointmentLabel(text: "Time* HH:MM AM/PM")
                .padding(.top, 24.67)
            Button {
                focus = nil
                pickingTime = true
            } label: {
                HStack(spacing: 8) {
                    Text(CreateAppointmentClock.clock(form.time))
                        .pfFont(16)
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    CreateAppointmentClockGlyph()
                        .stroke(CreateAppointmentLook.icon, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                        .frame(width: 19, height: 19)
                        .padding(.trailing, 16.33)
                }
                .padding(.leading, CreateAppointmentFieldBox.inset)
                .modifier(CreateAppointmentFieldBox(focused: pickingTime))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $pickingTime) {
                timePicker
            }
            .accessibilityLabel("Time")
            .accessibilityValue(CreateAppointmentClock.clock(form.time))
            .accessibilityHint("Choose the time")
            .padding(.top, CreateAppointmentLook.labelGap)
        }
    }

    /// The calendar, in the business's time zone, so the day it marks as today is the business's today (the form's first date);
    /// picking a day closes it.
    private var datePicker: some View {
        let zone = form.zone
        return DatePicker("Date", selection: dateSelection, displayedComponents: .date)
            .datePickerStyle(.graphical)
            .labelsHidden()
            .tint(Theme.blue)
            .environment(\.timeZone, zone)
            .environment(\.calendar, CreateAppointmentClock.calendar(in: zone))
            .frame(width: 320)
            .padding(12)
            .presentationCompactAdaptation(.popover)
    }

    /// The chosen day as noon on the business's clock, and the business's day of whatever is picked.
    private var dateSelection: Binding<Date> {
        Binding(
            get: { CreateAppointmentClock.noon(form.date, in: form.zone) ?? Date() },
            set: { picked in
                let day = CreateAppointmentClock.day(picked, in: form.zone)
                guard day != form.date else { return }
                form.setDate(day)
                pickingDate = false
            }
        )
    }

    /// The time wheel, on the business's clock.
    private var timePicker: some View {
        DatePicker("Time", selection: timeSelection, displayedComponents: .hourAndMinute)
            .datePickerStyle(.wheel)
            .labelsHidden()
            .environment(\.timeZone, CreateAppointmentClock.utc)
            .environment(\.calendar, CreateAppointmentClock.calendar)
            .frame(width: 320)
            .padding(12)
            .presentationCompactAdaptation(.popover)
    }

    private var timeSelection: Binding<Date> {
        Binding(
            get: { CreateAppointmentClock.timeDate(form.time) ?? Date(timeIntervalSince1970: 0) },
            set: { picked in form.setTime(CreateAppointmentClock.time(picked)) }
        )
    }

    /// The website's findAvail. A time is only chosen once the booked times are known: when they have not been read yet they are
    /// read first, and when they still cannot be read the server's words show instead of a time that may already be booked.
    private func findAvailability() {
        if form.appointmentsLoaded {
            found(form.findAvailability())
            return
        }
        guard let business = model.site, !finding else { return }
        finding = true
        let shownDate = form.date, shownTime = form.time
        Task {
            await form.loadAppointments(business.id)
            finding = false
            // The screen was left, or a date or time was chosen by hand while the booked times were being read: that stands.
            guard !closed, form.date == shownDate, form.time == shownTime else { return }
            if form.appointmentsLoaded {
                found(form.findAvailability())
            } else if !form.appointmentsError.isEmpty {
                Haptics.error()
                say(form.appointmentsError)
            }
        }
    }

    /// A light tap for a time found (the fields may already have been showing it); the website's words when there is none.
    private func found(_ time: Bool) {
        if time {
            Haptics.light()
            // The date and time fields further down changed without a word: VoiceOver is told which time was found.
            let words = "Next open time: \(CreateAppointmentClock.longDay(form.date)), \(CreateAppointmentClock.clock(form.time))"
            AccessibilityNotification.Announcement(words).post()
        } else {
            Haptics.error()
            say(CreateAppointmentModel.noOpenTimes)
        }
    }

    /// Shows a message now, or once the open sheet has gone (two presentations cannot overlap).
    private func say(_ message: String) {
        if sheet != nil {
            pendingProblem = message
        } else {
            problem = message
        }
    }

    /// Extra time (optional): hours 00 to 08 and minutes 00, 15, 30 or 45 added to the end.
    private var extraTime: some View {
        @Bindable var draft = form
        return VStack(alignment: .leading, spacing: 0) {
            Text("Extra time (optional)")
                .pfFont(16, .bold)
                .foregroundStyle(Color.primary)
                .padding(.top, 34.67)
            Text("Add additional time to the end of an appointment.")
                .pfFont(14)
                .foregroundStyle(Color.primary)
                .lineSpacing(3.3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12.33)
            CreateAppointmentLabel(text: "Hours")
                .padding(.top, 21.33)
            Menu {
                Picker("Hours", selection: $draft.extraHour) {
                    ForEach(CreateAppointmentModel.extraHourChoices, id: \.self) { value in
                        Text(value).tag(value)
                    }
                }
            } label: {
                CreateAppointmentDropdownLabel(value: form.extraHour)
            }
            .accessibilityLabel("Extra hours")
            .accessibilityValue(form.extraHour)
            .padding(.top, CreateAppointmentLook.labelGap)
            CreateAppointmentLabel(text: "Minutes")
                .padding(.top, 20.67)
            Menu {
                Picker("Minutes", selection: $draft.extraMinute) {
                    ForEach(CreateAppointmentModel.extraMinuteChoices, id: \.self) { value in
                        Text(value).tag(value)
                    }
                }
            } label: {
                CreateAppointmentDropdownLabel(value: form.extraMinute)
            }
            .accessibilityLabel("Extra minutes")
            .accessibilityValue(form.extraMinute)
            .padding(.top, CreateAppointmentLook.labelGap)
        }
    }

    /// The items added (with their quantity), Add inventory item and Add custom item.
    private var itemsPart: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !form.lines.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(form.lines) { line in
                        lineRow(line)
                    }
                }
                .padding(.top, 24)
            }
            Button("Add inventory item") {
                focus = nil
                sheet = .inventory
            }
            .buttonStyle(CreateAppointmentPillStyle(kind: .soft, fullWidth: false))
            .padding(.top, form.lines.isEmpty ? 32 : 24)
            Button {
                focus = nil
                sheet = .amount(.customItem)
            } label: {
                HStack(spacing: 10.67) {
                    CreateAppointmentPlusRing()
                        .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                        .frame(width: 19.33, height: 19.33)
                        .accessibilityHidden(true)
                    Text("Add custom item")
                        .pfFont(16, .semibold)
                        .foregroundStyle(Color.primary)
                }
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 19.33)
            .padding(.top, 10.33)
        }
    }

    /// One item: its name, one less and one more around the quantity, the amount, and a cross to take it away. The quantity and
    /// the amount keep their room (two digits, and amounts under $100), so one more or one less does not move the buttons.
    private func lineRow(_ line: CreateAppointmentLine) -> some View {
        HStack(alignment: .center, spacing: 8) {
            Text(line.name)
                .pfFont(16, .semibold)
                .foregroundStyle(Color.primary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            stepButton("minus", label: "One less \(line.name)") { step(line.id, by: -1) }
            Text(String(line.qty))
                .monospacedDigit()
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .frame(minWidth: 22)
                .accessibilityLabel("Quantity \(line.qty)")
            stepButton("plus", label: "One more \(line.name)") { step(line.id, by: 1) }
            Text(Money.format(line.price * line.qty))
                .monospacedDigit()
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .fixedSize()
                .frame(minWidth: 54, alignment: .trailing)
            // The cross is 32 pt; its tap area is 44 pt, without moving anything.
            Button {
                withAnimation(.snappy(duration: 0.25)) { form.removeLine(line.id) }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.primary)
                    .frame(width: 32, height: 32)
                    .padding(6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(-6)
            .accessibilityLabel("Remove \(line.name)")
        }
    }

    /// One more or one less; the last one going takes the line away, as the cross does.
    private func step(_ id: UUID, by change: Int) {
        withAnimation(.snappy(duration: 0.25)) { form.step(id, by: change) }
    }

    /// A 30 pt grey circle with a 44 pt tap area, without moving anything.
    private func stepButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.primary)
                .frame(width: 30, height: 30)
                .background(CreateAppointmentLook.pill, in: Circle())
                .padding(7)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(-7)
        .accessibilityLabel(label)
    }

    /// Subtotal, Order discount, Service charge, and Taxes and fees at the business's tax rate. The photo's lines are 33, 34 and
    /// 33 pt apart.
    private var totals: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("Subtotal")
                    .pfFont(15)
                    .foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                Text(Money.format(form.subtotal))
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
            }
            .accessibilityElement(children: .combine)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                CreateAppointmentLink(title: "Order discount") {
                    focus = nil
                    sheet = .amount(.discount)
                }
                Spacer(minLength: 8)
                Text("-" + Money.format(form.discountApplied))
                    .pfFont(16)
                    .foregroundStyle(CreateAppointmentLook.red)
                    .accessibilityLabel("Discount \(Money.format(form.discountApplied))")
            }
            .padding(.top, 13.67)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                CreateAppointmentLink(title: "Service charge") {
                    focus = nil
                    sheet = .amount(.charge)
                }
                Spacer(minLength: 8)
                Text(Money.format(form.charge))
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
                    .accessibilityLabel("Service charge \(Money.format(form.charge))")
            }
            .padding(.top, 14.67)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("Taxes and fees")
                    .pfFont(15)
                    .foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                Text(Money.format(form.tax))
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
            }
            .accessibilityElement(children: .combine)
            .padding(.top, 13.67)
        }
    }

    // MARK: Payment information, Notes and Appointment History

    /// The website's words: the payment is recorded from the appointment when the customer pays, which needs a customer first.
    private var paymentCard: some View {
        CreateAppointmentCard(title: "Payment information", open: form.isOpen(.payment), gap: 41, bottom: 15.33, toggle: { toggle(.payment) }) {
            Text(form.hasCustomer ? "Record the payment from the appointment when the customer pays." : "Select an existing customer or add a new customer to add payment information.")
                .pfFont(15)
                .foregroundStyle(form.hasCustomer ? SettingsLook.greyed : Color.primary)
                .lineSpacing(6.1)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var notesCard: some View {
        @Bindable var draft = form
        return CreateAppointmentCard(title: "Notes", open: form.isOpen(.notes), gap: 42, bottom: 13.67, toggle: { toggle(.notes) }) {
            VStack(alignment: .leading, spacing: 0) {
                CreateAppointmentLabel(text: "Notes")
                // "or appointment." keeps together, so the words wrap where the photo's do ("…the customer", "or appointment.").
                TextField("", text: $draft.notes, prompt: Text("Add information about the customer or\u{00A0}appointment.").foregroundStyle(CreateAppointmentLook.placeholder), axis: .vertical)
                    .pfFont(16)
                    .foregroundStyle(Color.primary)
                    .lineSpacing(4.9)
                    .lineLimit(6)
                    .textInputAutocapitalization(.sentences)
                    .focused($focus, equals: .notes)
                    .accessibilityLabel("Notes")
                    .padding(.horizontal, CreateAppointmentFieldBox.inset)
                    .padding(.top, 15.67)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
                    // The whole box takes a tap, not only the lines typed so far.
                    .background {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(SettingsLook.card)
                            .onTapGesture { focus = .notes }
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(focus == .notes ? CreateAppointmentLook.focus : CreateAppointmentLook.field, lineWidth: focus == .notes ? 2 : 1)
                            .allowsHitTesting(false)
                    }
                    .padding(.top, CreateAppointmentLook.labelGap)
                Text("\(form.notes.utf16.count)/\(CreateAppointmentModel.notesLimit) characters")
                    .pfFont(14)
                    .foregroundStyle(CreateAppointmentLook.placeholder)
                    .padding(.top, 8.33)
            }
        }
    }

    /// The chosen customer's appointments with the website's status words, or the photo's line when there are none. While the
    /// business's appointments have not been read, a chosen customer's history is unknown: the wait for them, or the server's
    /// words with a way to read them again.
    private var historyCard: some View {
        CreateAppointmentCard(title: "Appointment History", open: form.isOpen(.history), gap: 41, bottom: 15.33, toggle: { toggle(.history) }) {
            let past = form.history
            if past.isEmpty && form.customer != nil && !form.appointmentsLoaded {
                if form.appointmentsError.isEmpty {
                    ProgressView()
                        .tint(Theme.blue)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(form.appointmentsError)
                            .pfFont(15)
                            .foregroundStyle(SettingsLook.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        CreateAppointmentLink(title: "Try again", underlined: false) {
                            retry { await form.reloadAppointments($0) }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else if past.isEmpty {
                Text("There is no appointment history.")
                    .pfFont(15)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(past) { appointment in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(historyLine(appointment))
                                .pfFont(15)
                                .foregroundStyle(Color.primary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Text(CreateAppointmentModel.statusWord(appointment.status))
                                .pfFont(15, .bold)
                                .foregroundStyle(Color.primary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    /// "Tue, Nov 24, 2026 · Haircut", as the website's history lists it.
    private func historyLine(_ appointment: Appointment) -> String {
        let service = appointment.service.isEmpty ? "Booking" : appointment.service
        return CreateAppointmentClock.longDay(appointment.day) + " · " + service
    }

    // MARK: The bar at the foot

    /// The photo's bar: a 1 pt line, "Total: $0.00" (20 pt bold), then Cancel and Save, 48 pt pills 24 pt from the sides.
    private var bottomBar: some View {
        VStack(spacing: 0) {
            SettingsLook.border
                .frame(height: 1)
                .accessibilityHidden(true)
            VStack(spacing: 0) {
                Text("Total: \(Money.format(form.total))")
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.top, 13)
                // A save on its way cannot be called back, so Cancel waits for its answer (and stays as it is while the screen
                // closes after it).
                Button("Cancel") {
                    focus = nil
                    dismiss()
                }
                .buttonStyle(CreateAppointmentPillStyle(kind: .soft))
                .disabled(form.saving || form.saved)
                .padding(.top, 3)
                // While the appointment is on its way, and while the screen closes once it is saved, Save keeps its colour with
                // a spinner on it; pressing it again does nothing.
                Button {
                    save()
                } label: {
                    if form.saving || form.saved {
                        ProgressView()
                            .tint(Color.white)
                    } else {
                        Text("Save")
                    }
                }
                .buttonStyle(CreateAppointmentPillStyle(kind: .primary))
                .disabled(!form.ready)
                .accessibilityLabel("Save")
                .accessibilityValue(form.saving || form.saved ? "In progress" : "")
                .padding(.top, 16)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 7)
        }
        .background(SettingsLook.card)
    }

    private func save() {
        guard let business = model.site, form.ready, !form.saving, !form.saved else { return }
        focus = nil
        model.idle.touch()
        Task {
            do {
                let day = AppointmentsModel.forShell(model.shellID)
                if try await form.save(siteID: business.id) {
                    // The day view says so, in the website's words: the form opens on today whatever day was showing, so
                    // without them a booking for another day closes onto a day with nothing new on it.
                    day.leave(note: "Appointment created")
                    // Saved after the screen was left with Back: the appointment stands, and nothing else is closed.
                    if !closed {
                        Haptics.success()
                        dismiss()
                    }
                }
            } catch let error as APIError {
                guard !closed else {
                    // Left with Back before the answer came: the day view says why the appointment was not made, instead
                    // of nothing saying so anywhere. (A session that ended is said by the lock screen.)
                    if error.status != 401 { AppointmentsModel.forShell(model.shellID).leave(note: error.message) }
                    return
                }
                Haptics.error()
                problem = error.message
            } catch {
                // Cancelled: the screen went away.
            }
        }
    }

    // MARK: Sheets

    @ViewBuilder
    private func sheetContent(_ item: CreateAppointmentSheet) -> some View {
        switch item {
        case .inventory:
            CreateAppointmentInventorySheet(items: form.items, loaded: form.itemsLoaded, problem: form.itemsError, retry: {
                retry { await form.reloadItems($0) }
            }) { picked in
                if picked.variable {
                    // Priced at the time of sale: its price is asked for once this list has gone.
                    nextSheet = .amount(.itemPrice(picked))
                } else {
                    // The light tap the Sale screen gives an item added to an order (the keypad gives its own with Done).
                    add { form.addItem(picked) }
                    Haptics.light()
                }
                sheet = nil
            }
        case .amount(let kind):
            switch kind {
            case .itemPrice(let picked):
                CreateAppointmentAmountSheet(title: picked.name, question: "Price") { cents, _ in
                    add { form.addItem(picked, price: cents) }
                }
            case .customItem:
                CreateAppointmentAmountSheet(title: "Add custom item", question: "Price", asksName: true) { cents, name in
                    add { form.addCustom(name: name, price: cents) }
                }
            case .discount:
                CreateAppointmentAmountSheet(title: "Order discount", question: "Amount off", allowsZero: true, start: form.discountApplied) { cents, _ in
                    if let message = form.setDiscount(cents) { pendingProblem = message }
                }
            case .charge:
                CreateAppointmentAmountSheet(title: "Service charge", question: "Amount", allowsZero: true, start: form.charge) { cents, _ in
                    form.setCharge(cents)
                }
            }
        }
    }

    /// An item joins the appointment: the lines under it move down to make room.
    private func add(_ line: () -> Void) {
        withAnimation(.snappy(duration: 0.25)) { line() }
    }

    /// Two presentations cannot overlap: what comes next waits for the sheet to finish closing.
    private func sheetClosed() {
        if let next = nextSheet {
            nextSheet = nil
            sheet = next
        } else if let message = pendingProblem {
            pendingProblem = nil
            problem = message
        }
    }
}
