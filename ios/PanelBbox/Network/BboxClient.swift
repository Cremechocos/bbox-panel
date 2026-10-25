import Foundation

/// Mode direct : l'app parle à l'API de la Bbox comme l'IHM officielle (voir `server/bbox.mjs`).
/// - écritures en `x-www-form-urlencoded`, corps répété dans l'en-tête `ForceData` ;
/// - `?btoken=` sur les POST, obtenu juste avant par `GET /device/token` ;
/// - 3 requêtes simultanées au plus ; `PUT /login` toutes les 10 min d'activité.
actor BboxClient: PanelBackend {
    static let origin = "https://mabbox.bytel.fr"
    static let keepAliveInterval: TimeInterval = 10 * 60

    nonisolated let target: Target
    private let api: String
    private var cookies: [String: String]
    private var lastKeepAlive = Date()
    private let limiter = RequestLimiter(limit: 3)
    private let session: URLSession
    private let onCookies: @Sendable ([String: String]) -> Void

    init(target: Target, cookies: [String: String], timeout: TimeInterval = 15, onCookies: @escaping @Sendable ([String: String]) -> Void = { _ in }) {
        self.target = target
        self.api = target.url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/v1/"
        self.cookies = cookies
        self.onCookies = onCookies
        self.session = HTTP.makeSession(timeout: timeout, delegate: BboxTLSDelegate())
    }

    deinit { session.finishTasksAndInvalidate() }

    /// La Bbox répond-elle à cette origine ? (route publique, réponse rapide)
    static func probe(_ origin: URL, timeout: TimeInterval = 3) async -> Bool {
        let client = BboxClient(target: Target(kind: .bboxLocal, url: origin), cookies: [:], timeout: timeout)
        do {
            let (_, response) = try await client.send(.get, "summary")
            return response.statusCode < 500
        } catch {
            return false
        }
    }

    // MARK: Session

    func login(password: String) async throws {
        cookies = [:]
        let form: BboxForm = ["password": .string(password), "remember": 1]
        let (data, response) = try await send(.post, "login", body: form.encoded)
        switch response.statusCode {
        case 200 where !cookies.isEmpty:
            lastKeepAlive = Date()
            onCookies(cookies)
        case 401: throw PanelError.badPassword
        case 429: throw PanelError.locked(retryIn: nil)
        default: throw PanelError.from(status: response.statusCode, body: (try? JSON.parse(data)) ?? .null, remote: target.isRemoteBbox)
        }
    }

    func sessionIsValid() async -> Bool? {
        guard !cookies.isEmpty else { return false }
        do {
            let (data, response) = try await send(.get, "summary")
            if response.statusCode == 401 { return false }
            guard response.statusCode == 200 else { return nil }
            return (try? JSON.parse(data))?.unwrapped["authenticated"].int == 1
        } catch {
            return nil
        }
    }

    func logout() async {
        _ = try? await send(.post, "logout", body: "")
        cookies = [:]
        onCookies([:])
    }

    // MARK: Lecture et écriture

    func get(_ path: String) async throws -> JSON {
        keepAliveIfNeeded()
        let (data, response) = try await send(.get, path)
        return try decode(data, response)
    }

    @discardableResult
    func write(_ method: HTTPMethod, _ path: String, _ form: BboxForm) async throws -> JSON {
        keepAliveIfNeeded()
        // comme les deux IHM officielles : seul POST porte le btoken
        let query = method == .post ? "btoken=" + HTTP.encodeComponent(try await token()) : ""
        let (data, response) = try await send(method, path, query: query, body: form.encoded)
        return try decode(data, response)
    }

    func token() async throws -> String {
        let (data, response) = try await send(.get, "device/token")
        guard response.statusCode == 200 else {
            throw PanelError.from(status: response.statusCode, body: (try? JSON.parse(data)) ?? .null, remote: target.isRemoteBbox)
        }
        guard let token = (try? JSON.parse(data))?.unwrapped["device"]["token"].string, !token.isEmpty else {
            throw PanelError.http(response.statusCode, "token_missing")
        }
        return token
    }

    // MARK: Interne

    private func decode(_ data: Data, _ response: HTTPURLResponse) throws -> JSON {
        let json = ((try? JSON.parse(data)) ?? .null).fixingText
        guard (200..<300).contains(response.statusCode) else {
            throw PanelError.from(status: response.statusCode, body: json, remote: target.isRemoteBbox)
        }
        return json.unwrapped
    }

    /// Maintien de session, comme l'IHM officielle (refreshLogin) : `PUT /login` au plus toutes les 10 min.
    private func keepAliveIfNeeded() {
        guard !cookies.isEmpty, Date().timeIntervalSince(lastKeepAlive) > Self.keepAliveInterval else { return }
        lastKeepAlive = Date()
        Task { _ = try? await self.send(.put, "login", body: "") }
    }

    private func send(_ method: HTTPMethod, _ path: String, query: String = "", body: String? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: api + path + (query.isEmpty ? "" : "?" + query)) else { throw PanelError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json, text/plain, */*", forHTTPHeaderField: "Accept")
        request.setValue("XMLHttpRequest", forHTTPHeaderField: "X-Requested-With")
        request.setValue(Self.origin, forHTTPHeaderField: "Origin")
        request.setValue(Self.origin + "/", forHTTPHeaderField: "Referer")
        if !cookies.isEmpty { request.setValue(HTTP.cookieHeader(cookies), forHTTPHeaderField: "Cookie") }
        if let body {
            request.httpBody = Data(body.utf8)
            request.setValue("application/x-www-form-urlencoded; charset=UTF-8", forHTTPHeaderField: "Content-Type")
            if !body.isEmpty { request.setValue(body, forHTTPHeaderField: "ForceData") } // reproduit l'IHM officielle
        } else if method != .get {
            request.httpBody = Data()
        }
        let session = self.session
        let req = request
        let (data, response) = try await limiter.run { try await HTTP.send(session, req) }
        absorbCookies(response, url: url)
        return (data, response)
    }

    private func absorbCookies(_ response: HTTPURLResponse, url: URL) {
        let fresh = HTTP.cookies(from: response, url: url)
        guard !fresh.isEmpty else { return }
        for (name, value) in fresh { cookies[name] = value.isEmpty ? nil : value }
        // à la connexion, le stockage est fait par login() une fois le statut vérifié
        if url.path.hasSuffix("/login") && response.statusCode != 200 { return }
        onCookies(cookies)
    }
}
