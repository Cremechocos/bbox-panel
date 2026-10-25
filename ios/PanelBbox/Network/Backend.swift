import Foundation

/// Ce à quoi l'app est connectée, dans l'ordre d'essai du contrat (`docs/API-APPS.md`).
struct Target: Equatable, Sendable {
    enum Kind: String, Sendable, CaseIterable {
        case relayLocal, relayRemote, bboxLocal, bboxRemote
    }

    var kind: Kind
    /// Origine : `http://192.168.1.42:8484` pour un relais, `https://mabbox.bytel.fr` ou `https://hôte:port` pour la Bbox.
    var url: URL
    /// Relais seulement : il joint lui-même la Bbox par son accès distant.
    var relayReachesBboxRemotely = false

    var isRelay: Bool { kind == .relayLocal || kind == .relayRemote }
    /// La Bbox est jointe en direct par son accès distant : elle y refuse certaines fonctions.
    var isRemoteBbox: Bool { kind == .bboxRemote }
    var isAway: Bool { kind == .relayRemote || kind == .bboxRemote }

    var title: String {
        switch kind {
        case .relayLocal: return "Relais du panel"
        case .relayRemote: return "Relais du panel (à distance)"
        case .bboxLocal: return "Bbox en direct"
        case .bboxRemote: return "Bbox à distance"
        }
    }

    var hostLabel: String {
        guard let host = url.host else { return url.absoluteString }
        if let port = url.port { return "\(host):\(port)" }
        return host
    }

    /// Compte Keychain du cookie de session de cette cible.
    var keychainAccount: String { "\(kind.rawValue)|\(url.absoluteString)" }
}

/// Opérations communes aux deux modes. Les réponses sont déballées et leur texte réparé.
protocol PanelBackend: AnyObject, Sendable {
    var target: Target { get }
    func get(_ path: String) async throws -> JSON
    @discardableResult func write(_ method: HTTPMethod, _ path: String, _ form: BboxForm) async throws -> JSON
    func login(password: String) async throws
    /// `true` / `false` si la Bbox (ou le relais) a répondu, `nil` si elle est injoignable.
    func sessionIsValid() async -> Bool?
    func logout() async
}
