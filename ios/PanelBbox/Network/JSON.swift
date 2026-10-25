import Foundation

/// Valeur JSON dynamique. Les réponses de la Bbox changent de forme d'un firmware à l'autre
/// (nombres parfois en texte, clés absentes…) : on les lit comme un arbre, sans Decodable figé.
enum JSON: Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(any value: Any?) {
        switch value {
        case nil, is NSNull: self = .null
        case let n as NSNumber:
            // JSONSerialization rend les booléens sous forme de NSNumber : on les distingue par leur type CF.
            if CFGetTypeID(n) == CFBooleanGetTypeID() { self = .bool(n.boolValue) } else { self = .number(n.doubleValue) }
        case let s as String: self = .string(s)
        case let a as [Any]: self = .array(a.map { JSON(any: $0) })
        case let o as [String: Any]: self = .object(o.mapValues { JSON(any: $0) })
        default: self = .null
        }
    }

    static func parse(_ data: Data) throws -> JSON {
        if data.isEmpty { return .null }
        return JSON(any: try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    }

    subscript(key: String) -> JSON {
        if case .object(let o) = self { return o[key] ?? .null }
        return .null
    }

    subscript(index: Int) -> JSON {
        if case .array(let a) = self, a.indices.contains(index) { return a[index] }
        return .null
    }

    var isNull: Bool { self == .null }

    var string: String? {
        switch self {
        case .string(let s): return s
        case .number(let d): return d.rounded() == d && abs(d) < 1e15 ? String(Int(d)) : String(d)
        case .bool(let b): return b ? "1" : "0"
        default: return nil
        }
    }

    /// Entier, y compris quand la Bbox l'envoie en texte (« 1 », « -1 »).
    var int: Int? {
        switch self {
        case .number(let d): return d.isFinite ? Int(d) : nil
        case .string(let s): return Int(s.trimmingCharacters(in: .whitespaces)) ?? Double(s).flatMap { $0.isFinite ? Int($0) : nil }
        case .bool(let b): return b ? 1 : 0
        default: return nil
        }
    }

    var double: Double? {
        switch self {
        case .number(let d): return d
        case .string(let s): return Double(s.trimmingCharacters(in: .whitespaces))
        case .bool(let b): return b ? 1 : 0
        default: return nil
        }
    }

    /// Vrai pour `true`, `1` ou `"1"` : la Bbox code ses interrupteurs en 0/1.
    var isOn: Bool { int == 1 }

    var array: [JSON] {
        if case .array(let a) = self { return a }
        return []
    }

    var object: [String: JSON]? {
        if case .object(let o) = self { return o }
        return nil
    }

    /// La Bbox répond presque toujours par un tableau à un élément : `[{"wireless":{…}}]` → `{"wireless":{…}}`.
    var unwrapped: JSON {
        if case .array(let a) = self, a.count == 1 { return a[0] }
        return self
    }

    /// Répare récursivement l'UTF-8 doublement encodé de toutes les chaînes.
    var fixingText: JSON {
        switch self {
        case .string(let s): return .string(BboxText.fix(s))
        case .array(let a): return .array(a.map(\.fixingText))
        case .object(let o): return .object(o.mapValues(\.fixingText))
        default: return self
        }
    }

    /// Valeur Foundation, pour `JSONSerialization`.
    var anyValue: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let b): return b
        case .number(let d): return d.rounded() == d && abs(d) < 1e15 ? Int(d) as Any : d
        case .string(let s): return s
        case .array(let a): return a.map(\.anyValue)
        case .object(let o): return o.mapValues(\.anyValue)
        }
    }

    /// Fusionne un objet dans un autre, clé par clé (au premier niveau), comme `Object.assign`.
    func merging(_ other: JSON) -> JSON {
        guard case .object(var a) = self, case .object(let b) = other else { return other }
        for (k, v) in b { a[k] = v }
        return .object(a)
    }
}

extension JSON: ExpressibleByStringLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByBooleanLiteral {
    init(stringLiteral value: String) { self = .string(value) }
    init(arrayLiteral elements: JSON...) { self = .array(elements) }
    init(dictionaryLiteral elements: (String, JSON)...) { self = .object(Dictionary(elements, uniquingKeysWith: { $1 })) }
    init(booleanLiteral value: Bool) { self = .bool(value) }
    init(_ strings: [String]) { self = .array(strings.map(JSON.string)) }
    init(_ dict: [String: String]) { self = .object(dict.mapValues(JSON.string)) }
}
