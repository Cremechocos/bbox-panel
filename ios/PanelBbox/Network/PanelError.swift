import Foundation

/// Erreurs vues par l'interface, avec un message lisible (repris de `errMsg` du panel web).
enum PanelError: LocalizedError, Equatable {
    case network
    case untrusted
    case authRequired
    case badPassword
    case locked(retryIn: Int?)
    case remoteForbidden
    case blockedByPanel
    case bboxUnreachable
    case requiresRelay
    case notAvailable
    case invalidURL
    case notARelay
    case bbox(BboxException)
    case http(Int, String?)

    var errorDescription: String? {
        switch self {
        case .network: return "Connexion impossible : vérifiez le réseau."
        case .untrusted: return "Le certificat présenté n’est pas celui de la Bbox : connexion refusée."
        case .authRequired: return "Session expirée : reconnectez-vous."
        case .badPassword: return "Mot de passe incorrect."
        case .locked(let s):
            if let s, s > 0 { return "Trop d’essais : réessayez dans \(s) s." }
            return "La Bbox est verrouillée après plusieurs échecs : patientez quelques minutes."
        case .remoteForbidden: return "Indisponible à distance : la Bbox n’autorise cette fonction que depuis la maison."
        case .blockedByPanel: return "Action volontairement bloquée par le panel."
        case .bboxUnreachable: return "Le relais ne parvient pas à joindre la Bbox."
        case .requiresRelay: return "Nécessite le relais du panel."
        case .notAvailable: return "Fonction non disponible sur ce modèle de Bbox."
        case .invalidURL: return "Adresse invalide."
        case .notARelay: return "Aucun relais du panel ne répond à cette adresse."
        case .bbox(let ex): return ex.message
        case .http(let status, let code):
            if status >= 500 { return "La Bbox ne répond pas correctement." }
            return "Action impossible (\(code ?? String(status)))."
        }
    }

    /// Traduit une réponse en erreur. `remote` : la Bbox est jointe en direct par son accès distant,
    /// où un 403 signifie « fonction refusée à distance » (`api_remote_error` de l'IHM officielle).
    static func from(status: Int, body: JSON, remote: Bool) -> PanelError {
        let code = body["error"].string
        switch code {
        case "panel_auth_required", "bbox_auth_required": return .authRequired
        case "blocked_by_panel": return .blockedByPanel
        case "bbox_remote_forbidden": return .remoteForbidden
        case "bbox_unreachable": return .bboxUnreachable
        case "bad_password": return .badPassword
        case "local_throttle": return .locked(retryIn: body["retryIn"].int)
        case "bbox_locked": return .locked(retryIn: nil)
        default: break
        }
        if status == 401 { return .authRequired }
        if status == 403 && remote { return .remoteForbidden }
        if status == 429 { return .locked(retryIn: body["retryIn"].int) }
        if let ex = BboxException.from(body) { return .bbox(ex) }
        if status == 404 { return .notAvailable }
        return .http(status, code)
    }
}
