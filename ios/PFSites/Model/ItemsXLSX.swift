import Compression
import Foundation

/// Reads an Excel workbook (.xlsx) as the text of an item list, so a menu kept in Excel can be imported without saving it as CSV
/// first, as on the website (which converts the file in the browser). An .xlsx file is a zip of XML files, so nothing here needs a
/// package: the zip is read with the system's own decompression, the XML with XMLParser.
///
/// What comes out is CSV text, and from there an Excel file is treated exactly like a CSV file: the import sheet reads that text
/// and the server is sent that same text, so what the sheet says will be added is what the server adds.
enum ItemsXLSX {
    /// Every zip file starts with "PK", 3, 4.
    static func looksLikeWorkbook(_ data: Data) -> Bool {
        data.starts(with: [0x50, 0x4B, 0x03, 0x04])
    }

    /// The older Excel format (.xls) starts with these bytes, and so does a workbook saved with a password, whatever its name
    /// ends in (Excel wraps the encrypted file in the old container). Neither is a zip, and neither is read here.
    static func looksLikeOldExcel(_ data: Data) -> Bool {
        data.starts(with: [0xD0, 0xCF, 0x11, 0xE0])
    }

    /// The first sheet that has anything in it, as CSV text (the website's rule). Nil when the file is not a workbook this can
    /// read: not a zip, damaged, protected with a password, or larger than the limits below.
    static func csv(from data: Data) -> String? {
        guard let zip = Zip(data) else { return nil }
        let shared = zip.file("xl/sharedStrings.xml").map(sharedStrings) ?? []
        let places = zip.file("xl/styles.xml").map(decimalPlaces) ?? []
        for path in sheetPaths(in: zip) {
            guard let xml = zip.file(path) else { continue }
            let rows = sheetRows(xml, shared: shared, places: places)
            guard rows.contains(where: { row in row.contains { !$0.isEmpty } }) else { continue }
            return text(rows)
        }
        return nil
    }

    // MARK: Rows to CSV text

    /// The most text the server reads from one upload (`str(b.csv, 1_000_000)`); rows past it are left off whole.
    private static let mostCharacters = 1_000_000

    private static func text(_ rows: [[String]]) -> String {
        var out = ""
        for row in rows where row.contains(where: { !$0.isEmpty }) {
            let line = row.map { "\"" + $0.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }.joined(separator: ",")
            if out.utf16.count + line.utf16.count + 1 > mostCharacters { break }
            if !out.isEmpty { out += "\n" }
            out += line
        }
        return out
    }

    // MARK: The workbook's parts

    /// The sheets in the order the workbook lists them. When that list cannot be read, the sheet files in name order.
    private static func sheetPaths(in zip: Zip) -> [String] {
        var targets: [String: String] = [:]
        if let rels = zip.file("xl/_rels/workbook.xml.rels") {
            let reader = Elements(wanted: ["Relationship"])
            reader.read(rels)
            for attributes in reader.found {
                guard let id = attributes["Id"], let target = attributes["Target"] else { continue }
                targets[id] = target.hasPrefix("/") ? String(target.dropFirst()) : "xl/" + target
            }
        }
        var paths: [String] = []
        if let book = zip.file("xl/workbook.xml") {
            let reader = Elements(wanted: ["sheet"])
            reader.read(book)
            for attributes in reader.found {
                // The relationship id is written with its prefix ("r:id"); the prefix can be any name.
                guard let id = attributes.first(where: { $0.key == "id" || $0.key.hasSuffix(":id") })?.value, let path = targets[id] else { continue }
                paths.append(path)
            }
        }
        if paths.isEmpty {
            paths = zip.names.filter { $0.hasPrefix("xl/worksheets/") && $0.hasSuffix(".xml") && !$0.contains("/_rels/") }.sorted()
        }
        return paths
    }

    private static func sharedStrings(_ xml: Data) -> [String] {
        let reader = SharedStrings()
        let parser = XMLParser(data: xml)
        parser.delegate = reader
        parser.parse()
        return reader.strings
    }

    private static func sheetRows(_ xml: Data, shared: [String], places: [Int?]) -> [[String]] {
        let reader = SheetRows(shared: shared, places: places)
        let parser = XMLParser(data: xml)
        parser.delegate = reader
        parser.parse()
        return reader.rows
    }

    /// A number as the spreadsheet shows it. With no format of its own: whole numbers with no decimal point (a barcode stays
    /// its digits), others to 15 significant digits (9.9900000000000002, as the file can store 9.99, reads 9.99). In a cell
    /// formatted to a number of decimal places (a price shown as $3.24 whose formula left 3.237 in the file), rounded to those
    /// places the way Excel rounds, so the price read is the price seen.
    static func number(_ raw: String, places: Int? = nil) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Double(trimmed), value.isFinite else { return trimmed }
        if let places, abs(value) < 1e15 {
            // Rounded as written in decimal (2.675 is 2.68, as on the sheet), not as stored in binary (2.67499...).
            let exact = NSDecimalNumber(string: String(format: "%.15g", value), locale: Locale(identifier: "en_US_POSIX"))
            guard exact != NSDecimalNumber.notANumber else { return trimmed }
            let rule = NSDecimalNumberHandler(roundingMode: .plain, scale: Int16(places), raiseOnExactness: false, raiseOnOverflow: false, raiseOnUnderflow: false, raiseOnDivideByZero: false)
            var text = exact.rounding(accordingToBehavior: rule).description(withLocale: Locale(identifier: "en_US_POSIX"))
            if places > 0 {
                // Always the full number of places ("3.2" is "3.20"), as the sheet shows it.
                let have = text.firstIndex(of: ".").map { text.distance(from: $0, to: text.endIndex) - 1 } ?? -1
                if have < 0 { text += "." }
                if have < places { text += String(repeating: "0", count: places - max(have, 0)) }
            }
            return text
        }
        if value == value.rounded(), abs(value) < 1e15 { return String(Int64(value)) }
        return String(format: "%.15g", value)
    }

    // MARK: Number formats

    /// For each cell style of the workbook, in order: how many decimal places its number format shows, or nil when it has no
    /// fixed number of places (General, dates, percentages, text), in which case the number is read as it is stored.
    private static func decimalPlaces(_ xml: Data) -> [Int?] {
        let reader = Styles()
        let parser = XMLParser(data: xml)
        parser.delegate = reader
        parser.parse()
        return reader.formats.map { id in
            if let code = reader.custom[id] { return places(inFormat: code) }
            return builtInPlaces[id]
        }
    }

    /// Excel's built-in number formats that show a fixed number of decimal places (0.00, #,##0.00, the currency and accounting
    /// ones). The others are General, dates, times, percentages, fractions and scientific notation.
    private static let builtInPlaces: [Int: Int] = [1: 0, 2: 2, 3: 0, 4: 2, 5: 0, 6: 0, 7: 2, 8: 2, 37: 0, 38: 0, 39: 2, 40: 2, 41: 0, 42: 0, 43: 2, 44: 2]

    /// The decimal places a custom format shows for a positive number ("$"#,##0.00 is 2, #,##0 is 0), or nil for a format that
    /// is not a plain number: General, a date or time, a percentage, a fraction, scientific notation, text.
    static func places(inFormat format: String) -> Int? {
        // The first of the format's sections (positive numbers), without quoted words, escaped characters and [bracketed] parts.
        var code = ""
        var quoted = false
        var bracket = false
        var skip = false
        for character in format {
            if skip { skip = false; continue }
            if quoted { if character == "\"" { quoted = false }; continue }
            if bracket { if character == "]" { bracket = false }; continue }
            switch character {
            case "\"": quoted = true
            case "[": bracket = true
            case "\\", "_", "*": skip = true
            case ";": return places(inPlainCode: code)
            default: code.append(character)
            }
        }
        return places(inPlainCode: code)
    }

    private static func places(inPlainCode code: String) -> Int? {
        let lower = code.lowercased()
        if lower.contains("general") || lower.contains("@") || lower.contains("%") || lower.contains("e+") || lower.contains("e-") || lower.contains("/") { return nil }
        if lower.contains(where: { "ymdhs".contains($0) }) { return nil }
        guard lower.contains(where: { $0 == "0" || $0 == "#" || $0 == "?" }) else { return nil }
        guard let dot = lower.firstIndex(of: ".") else { return 0 }
        return lower[lower.index(after: dot)...].prefix(while: { $0 == "0" || $0 == "#" || $0 == "?" }).count
    }

    /// "A" is column 0, "Z" 25, "AA" 26: the letters at the start of a cell's name ("BC12").
    static func column(of cell: String) -> Int? {
        var index = 0
        var letters = 0
        for scalar in cell.unicodeScalars {
            let value = scalar.value
            let upper = (97...122).contains(value) ? value - 32 : value
            guard (65...90).contains(upper) else { break }
            index = index * 26 + Int(upper - 64)
            letters += 1
            if letters > 3 { return nil }
        }
        return letters == 0 ? nil : index - 1
    }
}

// MARK: - The zip

/// Just enough of the zip format to take named files out of a workbook: the list at the end of the file, then each file stored
/// plainly or deflated. Encrypted and 64-bit zips are not read.
private struct Zip {
    private struct Entry {
        let method: Int
        let packed: Int
        let size: Int
        let offset: Int
    }

    private let data: Data
    private var entries: [String: Entry] = [:]

    /// The most one file inside may unpack to, and the most files looked at: far above any real menu, far below what would
    /// exhaust the phone's memory.
    private static let mostBytes = 64 * 1024 * 1024
    private static let mostEntries = 5000

    var names: [String] { Array(entries.keys) }

    init?(_ data: Data) {
        // Indexes below count from 0 whatever slice was handed in.
        self.data = Data(data)
        let bytes = self.data
        let count = bytes.count
        guard count >= 22 else { return nil }
        // The end record is the last thing in the file, before an optional comment of up to 65,535 bytes.
        var end = -1
        var probe = count - 22
        let stop = max(0, count - 22 - 65_535)
        while probe >= stop {
            if bytes[probe] == 0x50, bytes[probe + 1] == 0x4B, bytes[probe + 2] == 0x05, bytes[probe + 3] == 0x06 {
                end = probe
                break
            }
            probe -= 1
        }
        guard end >= 0 else { return nil }
        let total = Zip.u16(bytes, end + 10)
        var at = Zip.u32(bytes, end + 16)
        guard total <= Zip.mostEntries else { return nil }
        for _ in 0..<total {
            guard at + 46 <= count, bytes[at] == 0x50, bytes[at + 1] == 0x4B, bytes[at + 2] == 0x01, bytes[at + 3] == 0x02 else { return nil }
            let flags = Zip.u16(bytes, at + 8)
            let method = Zip.u16(bytes, at + 10)
            let packed = Zip.u32(bytes, at + 20)
            let size = Zip.u32(bytes, at + 24)
            let nameLength = Zip.u16(bytes, at + 28)
            let extraLength = Zip.u16(bytes, at + 30)
            let commentLength = Zip.u16(bytes, at + 32)
            let offset = Zip.u32(bytes, at + 42)
            guard at + 46 + nameLength <= count else { return nil }
            let name = String(decoding: bytes[(at + 46)..<(at + 46 + nameLength)], as: UTF8.self)
            // Bit 0: encrypted (a workbook saved with a password). Sizes of 0xFFFFFFFF belong to the 64-bit format.
            if flags & 1 == 0, packed != 0xFFFF_FFFF, size != 0xFFFF_FFFF {
                entries[name] = Entry(method: method, packed: packed, size: size, offset: offset)
            }
            at += 46 + nameLength + extraLength + commentLength
        }
    }

    /// One file's contents, or nil when it is not there or cannot be unpacked.
    func file(_ name: String) -> Data? {
        guard let entry = entries[name], entry.size <= Zip.mostBytes else { return nil }
        let count = data.count
        let head = entry.offset
        guard head + 30 <= count, data[head] == 0x50, data[head + 1] == 0x4B, data[head + 2] == 0x03, data[head + 3] == 0x04 else { return nil }
        let start = head + 30 + Zip.u16(data, head + 26) + Zip.u16(data, head + 28)
        guard start >= 0, entry.packed >= 0, start + entry.packed <= count else { return nil }
        let packed = data.subdata(in: start..<(start + entry.packed))
        switch entry.method {
        case 0:
            return packed
        case 8:
            return Zip.inflate(packed, size: entry.size)
        default:
            return nil
        }
    }

    /// Unpacks deflated bytes (the zip's method 8, which is what the system calls ZLIB: the raw stream, with no header).
    private static func inflate(_ packed: Data, size: Int) -> Data? {
        guard size > 0 else { return Data() }
        var out = Data(count: size)
        let written = out.withUnsafeMutableBytes { (target: UnsafeMutableRawBufferPointer) -> Int in
            packed.withUnsafeBytes { (source: UnsafeRawBufferPointer) -> Int in
                guard let to = target.bindMemory(to: UInt8.self).baseAddress, let from = source.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                return compression_decode_buffer(to, size, from, packed.count, nil, COMPRESSION_ZLIB)
            }
        }
        return written == size ? out : nil
    }

    private static func u16(_ data: Data, _ at: Int) -> Int {
        Int(data[at]) | Int(data[at + 1]) << 8
    }

    private static func u32(_ data: Data, _ at: Int) -> Int {
        Int(data[at]) | Int(data[at + 1]) << 8 | Int(data[at + 2]) << 16 | Int(data[at + 3]) << 24
    }
}

// MARK: - The XML

/// Collects the attributes of every element with one of the wanted names (the workbook's sheets, its relationships).
private final class Elements: NSObject, XMLParserDelegate {
    private let wanted: Set<String>
    private(set) var found: [[String: String]] = []

    init(wanted: Set<String>) {
        self.wanted = wanted
    }

    func read(_ xml: Data) {
        let parser = XMLParser(data: xml)
        parser.delegate = self
        parser.parse()
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        if wanted.contains(ItemsXMLName.plain(elementName)) { found.append(attributeDict) }
    }
}

/// An element's name without a namespace prefix ("x:row" is "row"): some programs write the prefix, Excel does not.
private enum ItemsXMLName {
    static func plain(_ name: String) -> String {
        guard let colon = name.lastIndex(of: ":") else { return name }
        return String(name[name.index(after: colon)...])
    }
}

/// The workbook's shared strings: each `si` is one string, the text of its `t` parts put together. The phonetic guides some
/// languages add (`rPh`) are not part of the text.
private final class SharedStrings: NSObject, XMLParserDelegate {
    private(set) var strings: [String] = []
    private var current = ""
    private var inText = false
    private var phonetic = 0

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        switch ItemsXMLName.plain(elementName) {
        case "si": current = ""
        case "rPh": phonetic += 1
        case "t": inText = phonetic == 0
        default: break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inText { current += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        switch ItemsXMLName.plain(elementName) {
        case "si": strings.append(current)
        case "rPh": phonetic = max(0, phonetic - 1)
        case "t": inText = false
        default: break
        }
    }
}

/// A sheet's rows of cells as text. A cell says where it is ("C7"), so cells left empty in the file leave their place empty here,
/// and a column never slides left.
private final class SheetRows: NSObject, XMLParserDelegate {
    private let shared: [String]
    /// Decimal places by cell style (see `ItemsXLSX.decimalPlaces`).
    private let places: [Int?]
    private(set) var rows: [[String]] = []

    private var row: [String] = []
    private var inRow = false
    private var cellColumn = 0
    private var cellType = ""
    private var cellStyle: Int?
    private var value = ""
    private var inline = ""
    private var inValue = false
    private var inInline = false
    private var phonetic = 0

    /// Far more than a menu has; a sheet claiming more columns or rows than this is not read further.
    private static let mostColumns = 500
    private static let mostRows = 20_000

    init(shared: [String], places: [Int?]) {
        self.shared = shared
        self.places = places
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        switch ItemsXMLName.plain(elementName) {
        case "row":
            inRow = true
            row = []
        case "c":
            // Without a name the cell follows the one before it.
            cellColumn = attributeDict["r"].flatMap(ItemsXLSX.column(of:)) ?? row.count
            cellType = attributeDict["t"] ?? ""
            cellStyle = attributeDict["s"].flatMap { Int($0) }
            value = ""
            inline = ""
        case "v":
            inValue = true
        case "rPh":
            phonetic += 1
        case "t":
            inInline = phonetic == 0
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inValue { value += string } else if inInline { inline += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        switch ItemsXMLName.plain(elementName) {
        case "v":
            inValue = false
        case "t":
            inInline = false
        case "rPh":
            phonetic = max(0, phonetic - 1)
        case "c":
            guard inRow, cellColumn >= 0, cellColumn < SheetRows.mostColumns else { return }
            let text = cellText()
            if text.isEmpty { return }
            while row.count < cellColumn { row.append("") }
            if row.count == cellColumn { row.append(text) } else { row[cellColumn] = text }
        case "row":
            inRow = false
            rows.append(row)
            if rows.count >= SheetRows.mostRows { parser.abortParsing() }
        default:
            break
        }
    }

    private func cellText() -> String {
        switch cellType {
        case "s":
            // A shared string, by its place in the list.
            guard let index = Int(value.trimmingCharacters(in: .whitespacesAndNewlines)), shared.indices.contains(index) else { return "" }
            return shared[index]
        case "inlineStr":
            return inline
        case "str", "d", "e":
            // A formula's text, a date written out, or an error such as #N/A: as it stands.
            return value
        case "b":
            return value.trimmingCharacters(in: .whitespacesAndNewlines) == "1" ? "TRUE" : "FALSE"
        default:
            let shown = cellStyle.flatMap { places.indices.contains($0) ? places[$0] : nil }
            return ItemsXLSX.number(value, places: shown)
        }
    }
}

/// The workbook's styles: the number format of each cell style (`cellXfs`, in order), and the custom formats by their number.
private final class Styles: NSObject, XMLParserDelegate {
    private(set) var formats: [Int] = []
    private(set) var custom: [Int: String] = [:]
    private var inCellStyles = false

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        switch ItemsXMLName.plain(elementName) {
        case "numFmt":
            if let id = attributeDict["numFmtId"].flatMap({ Int($0) }), let code = attributeDict["formatCode"] { custom[id] = code }
        case "cellXfs":
            inCellStyles = true
        case "xf":
            if inCellStyles { formats.append(attributeDict["numFmtId"].flatMap { Int($0) } ?? 0) }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if ItemsXMLName.plain(elementName) == "cellXfs" { inCellStyles = false }
    }
}
