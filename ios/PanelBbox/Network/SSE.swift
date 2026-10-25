import Foundation

struct SSEEvent: Equatable, Sendable {
    var event: String
    var data: String
}

/// Lecteur de flux Server-Sent Events, ligne par ligne (format du relais : `event:`, `data:`, `retry:`, `: ping`).
struct SSEParser {
    private var event = ""
    private var data: [String] = []

    /// Une ligne vide termine l'évènement en cours et le renvoie.
    mutating func feed(_ line: String) -> SSEEvent? {
        if line.isEmpty {
            defer { event = ""; data = [] }
            guard !data.isEmpty else { return nil }
            return SSEEvent(event: event.isEmpty ? "message" : event, data: data.joined(separator: "\n"))
        }
        if line.hasPrefix(":") { return nil } // commentaire (battement « : ping »)
        let field: Substring, value: Substring
        if let i = line.firstIndex(of: ":") {
            field = line[..<i]
            var v = line[line.index(after: i)...]
            if v.hasPrefix(" ") { v = v.dropFirst() }
            value = v
        } else {
            field = Substring(line); value = ""
        }
        switch field {
        case "event": event = String(value)
        case "data": data.append(String(value))
        default: break // « retry » et « id » : la reconnexion est gérée par l'app
        }
        return nil
    }
}
