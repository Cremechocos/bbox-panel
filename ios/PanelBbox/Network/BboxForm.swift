import Foundation

/// Valeur d'un champ d'écriture. Les booléens partent en `1`/`0`, comme le fait l'IHM officielle.
enum FormValue: Equatable, Sendable, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByBooleanLiteral {
    case string(String)
    case int(Int)
    case bool(Bool)

    init(stringLiteral value: String) { self = .string(value) }
    init(integerLiteral value: Int) { self = .int(value) }
    init(booleanLiteral value: Bool) { self = .bool(value) }

    var formString: String {
        switch self {
        case .string(let s): return s
        case .int(let i): return String(i)
        case .bool(let b): return b ? "1" : "0"
        }
    }

    /// Pour le relais, qui reçoit du JSON et fait lui-même la conversion en formulaire.
    var jsonValue: Any {
        switch self {
        case .string(let s): return s
        case .int(let i): return i
        case .bool(let b): return b ? 1 : 0
        }
    }
}

/// Corps d'écriture ordonné (l'ordre des champs est conservé, comme `URLSearchParams`).
struct BboxForm: Equatable, Sendable, ExpressibleByDictionaryLiteral {
    struct Field: Equatable, Sendable {
        var key: String
        var value: FormValue
    }

    var fields: [Field]

    init(_ fields: [Field] = []) { self.fields = fields }
    init(dictionaryLiteral elements: (String, FormValue)...) {
        fields = elements.map { Field(key: $0.0, value: $0.1) }
    }

    var isEmpty: Bool { fields.isEmpty }

    /// `application/x-www-form-urlencoded`, à l'identique de `URLSearchParams.toString()` côté relais :
    /// espace → `+`, seuls les alphanumériques ASCII et `*-._` restent en clair.
    var encoded: String {
        fields.map { BboxForm.escape($0.key) + "=" + BboxForm.escape($0.value.formString) }.joined(separator: "&")
    }

    var jsonObject: [String: Any] {
        var o: [String: Any] = [:]
        for f in fields { o[f.key] = f.value.jsonValue }
        return o
    }

    static func escape(_ s: String) -> String {
        var out = ""
        for byte in s.utf8 {
            switch byte {
            case 0x20: out.append("+")
            case 0x2A, 0x2D, 0x2E, 0x5F, 0x30...0x39, 0x41...0x5A, 0x61...0x7A:
                out.append(Character(UnicodeScalar(byte)))
            default: out.append(String(format: "%%%02X", byte))
            }
        }
        return out
    }
}
