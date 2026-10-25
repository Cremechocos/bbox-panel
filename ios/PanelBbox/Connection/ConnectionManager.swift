import Foundation
import Observation

/// Réglages de connexion (aucun secret : les cookies sont dans le Keychain).
struct ConnectionSettings: Equatable {
    var relayLocal: URL?
    var relayRemote: URL?
    /// Accès distant de la Bbox : IP publique ou nom DynDNS, et port (« Administration à distance », 443 par défaut).
    var remoteHost: String = ""
    var remotePort: Int = 443
    var didAutoScan = false

    private static let defaults = UserDefaults.standard

    static func load() -> ConnectionSettings {
        var s = ConnectionSettings()
        s.relayLocal = defaults.string(forKey: "relayLocal").flatMap(URL.init(string:))
        s.relayRemote = defaults.string(forKey: "relayRemote").flatMap(URL.init(string:))
        s.remoteHost = defaults.string(forKey: "remoteHost") ?? ""
        s.remotePort = defaults.object(forKey: "remotePort") as? Int ?? 443
        s.didAutoScan = defaults.bool(forKey: "didAutoScan")
        return s
    }

    func save() {
        let d = Self.defaults
        d.set(relayLocal?.absoluteString, forKey: "relayLocal")
        d.set(relayRemote?.absoluteString, forKey: "relayRemote")
        d.set(remoteHost, forKey: "remoteHost")
        d.set(remotePort, forKey: "remotePort")
        d.set(didAutoScan, forKey: "didAutoScan")
    }

    /// Origine de l'accès distant de la Bbox, si configuré.
    var remoteBboxOrigin: URL? {
        let host = remoteHost.trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty, (1...65535).contains(remotePort) else { return nil }
        var c = URLComponents()
        c.scheme = "https"
        c.host = host
        if remotePort != 443 { c.port = remotePort }
        return c.url
    }
}

/// Connexion hybride : relais local → relais distant → Bbox locale → Bbox distante.
@MainActor @Observable
final class ConnectionManager {
    enum Phase {
        case searching(String)
        case login(Target)
        case connected(PanelStore)
        case unreachable
    }

    private(set) var phase: Phase = .searching("Recherche de votre Bbox…")
    var settings = ConnectionSettings.load() { didSet { settings.save() } }
    /// Dernier problème de connexion à afficher (mot de passe, Bbox injoignable…).
    var notice: String?
    private(set) var backend: (any PanelBackend)?
    private var connectTask: Task<Void, Never>?

    static let localBboxOrigins = [URL(string: BboxClient.origin)!, URL(string: "https://192.168.1.254")!]

    var target: Target? { backend?.target }

    func connect() {
        connectTask?.cancel()
        connectTask = Task { await runConnect() }
    }

    private func runConnect() async {
        if case .connected(let store) = phase { store.stop() }
        backend = nil
        guard let target = await findTarget(), !Task.isCancelled else {
            if !Task.isCancelled { phase = .unreachable }
            return
        }
        await open(target)
    }

    /// Essaie chaque mode dans l'ordre du contrat et renvoie le premier qui répond.
    func findTarget() async -> Target? {
        phase = .searching("Recherche du relais du panel…")
        if let url = settings.relayLocal, let info = await RelayClient.info(at: url) {
            return Target(kind: .relayLocal, url: url, relayReachesBboxRemotely: info.remote)
        }
        if settings.relayLocal == nil && settings.relayRemote == nil && !settings.didAutoScan {
            // premier lancement : on cherche un relais sur le réseau de la maison, une seule fois
            settings.didAutoScan = true
            phase = .searching("Recherche d’un relais sur le réseau…")
            if let url = await Discovery.scanForRelay(), let info = await RelayClient.info(at: url) {
                settings.relayLocal = url
                return Target(kind: .relayLocal, url: url, relayReachesBboxRemotely: info.remote)
            }
        }
        if let url = settings.relayRemote, let info = await RelayClient.info(at: url, timeout: 5) {
            return Target(kind: .relayRemote, url: url, relayReachesBboxRemotely: info.remote)
        }
        phase = .searching("Recherche de la Bbox…")
        for url in Self.localBboxOrigins where await BboxClient.probe(url) {
            return Target(kind: .bboxLocal, url: url)
        }
        if let url = settings.remoteBboxOrigin {
            phase = .searching("Connexion à l’accès distant de la Bbox…")
            if await BboxClient.probe(url, timeout: 6) { return Target(kind: .bboxRemote, url: url) }
        }
        return nil
    }

    /// Ouvre une cible : session gardée valide → tableau de bord, sinon écran de connexion.
    func open(_ target: Target) async {
        let backend = makeBackend(target)
        self.backend = backend
        if !Keychain.load(account: target.keychainAccount).isEmpty {
            phase = .searching("Reprise de la session…")
            let valid = await backend.sessionIsValid()
            guard !Task.isCancelled else { return }
            if valid == true {
                showDashboard(backend)
                return
            }
            if valid == false { Keychain.delete(account: target.keychainAccount) }
        }
        phase = .login(target)
    }

    func login(password: String) async throws {
        guard let backend else { throw PanelError.network }
        try await backend.login(password: password)
        notice = nil
        showDashboard(backend)
    }

    func logout() async {
        if case .connected(let store) = phase { store.stop() }
        if let backend {
            await backend.logout()
            Keychain.delete(account: backend.target.keychainAccount)
            phase = .login(backend.target)
        }
    }

    /// Jumelage par lien `bboxpanel://pair?url=…` ou QR code : valide l'URL, appelle `/panel/info`, puis connexion.
    func pair(with link: URL) async throws {
        guard let origin = Discovery.pairingOrigin(from: link) ?? (link.scheme?.hasPrefix("http") == true ? Discovery.relayOrigin(from: link.absoluteString) : nil) else {
            throw PanelError.invalidURL
        }
        try await useRelay(origin)
    }

    /// Enregistre un relais après avoir vérifié qu'il répond, puis s'y connecte.
    func useRelay(_ origin: URL) async throws {
        guard await RelayClient.info(at: origin, timeout: 5) != nil else { throw PanelError.notARelay }
        if Discovery.isLocal(origin) { settings.relayLocal = origin } else { settings.relayRemote = origin }
        connect()
    }

    func forgetRelays() {
        for url in [settings.relayLocal, settings.relayRemote].compactMap({ $0 }) {
            for kind in [Target.Kind.relayLocal, .relayRemote] {
                Keychain.delete(account: Target(kind: kind, url: url).keychainAccount)
            }
        }
        settings.relayLocal = nil
        settings.relayRemote = nil
        connect()
    }

    /// Appelé par le tableau de bord quand la session a expiré.
    func sessionLost() {
        guard let backend else { return }
        if case .connected(let store) = phase { store.stop() }
        Keychain.delete(account: backend.target.keychainAccount)
        notice = "Session expirée : reconnectez-vous."
        phase = .login(backend.target)
    }

    private func showDashboard(_ backend: any PanelBackend) {
        let store = PanelStore(backend: backend)
        store.onAuthLost = { [weak self] in self?.sessionLost() }
        phase = .connected(store)
        store.start()
    }

    private func makeBackend(_ target: Target) -> any PanelBackend {
        let account = target.keychainAccount
        let cookies = Keychain.load(account: account)
        let persist: @Sendable ([String: String]) -> Void = { Keychain.save($0, account: account) }
        if target.isRelay { return RelayClient(target: target, cookies: cookies, onCookies: persist) }
        return BboxClient(target: target, cookies: cookies, onCookies: persist)
    }
}
