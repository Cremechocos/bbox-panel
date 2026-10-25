import Foundation

/// Textes de la Bbox : les accents arrivent doublement encodés en UTF-8 (« bloquÃ©s » pour « bloqués »).
enum BboxText {
    /// Même règle que `fixText` du panel web (`web/src/lib/format.ts`) : si la chaîne contient un caractère
    /// de Â à ô suivi d'un caractère de U+0080 à ¿, on relit ses caractères comme des octets Latin-1
    /// puis on les décode en UTF-8. En cas d'échec, la chaîne est rendue telle quelle.
    static func fix(_ s: String) -> String {
        guard looksDoubleEncoded(s) else { return s }
        var bytes: [UInt8] = []
        bytes.reserveCapacity(s.unicodeScalars.count)
        for scalar in s.unicodeScalars {
            // Un caractère au-delà de Latin-1 ne peut pas venir d'un double encodage.
            guard scalar.value <= 0xFF else { return s }
            bytes.append(UInt8(scalar.value))
        }
        return String(bytes: bytes, encoding: .utf8) ?? s
    }

    static func looksDoubleEncoded(_ s: String) -> Bool {
        var previous: UInt32 = 0
        for scalar in s.unicodeScalars {
            let v = scalar.value
            if (0xC2...0xF4).contains(previous) && (0x80...0xBF).contains(v) { return true }
            previous = v
        }
        return false
    }
}

/// Erreur renvoyée par la Bbox : `{ exception: { domain, code, errors: [{ "name:"|"name", reason }] } }`.
struct BboxException: Equatable, Sendable {
    struct Item: Equatable, Sendable {
        var name: String?
        var reason: String?
    }

    var domain: String?
    var code: String?
    var errors: [Item]

    /// Lit l'erreur dans une réponse brute (déballée ou non). `nil` si ce n'en est pas une.
    static func from(_ json: JSON) -> BboxException? {
        let ex = json.unwrapped["exception"]
        guard ex.object != nil else { return nil }
        let items = ex["errors"].array.map { e in
            // attention : la clé est parfois « name: », avec les deux-points
            Item(name: e["name"].string ?? e["name:"].string, reason: e["reason"].string)
        }
        return BboxException(domain: ex["domain"].string, code: ex["code"].string, errors: items)
    }

    /// « Object does not exist » : l'objet n'existe pas dans le firmware (fonction absente de ce modèle).
    var isMissingObject: Bool {
        errors.contains { normalized($0.reason) == "object does not exist" }
    }

    var message: String {
        if isMissingObject { return "Fonction absente du firmware de votre Bbox." }
        guard let first = errors.first else { return "La Bbox a refusé l’action." }
        let reason = normalized(first.reason)
        var text = "La Bbox a refusé"
        if let name = first.name, !name.isEmpty { text += " le champ « \(name) »" }
        if !reason.isEmpty { text += " (\(reason))" }
        return text + "."
    }

    private func normalized(_ s: String?) -> String {
        (s ?? "").replacingOccurrences(of: "_", with: " ").lowercased()
    }
}
