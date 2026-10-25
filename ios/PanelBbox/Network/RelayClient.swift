import Foundation

/// Réponse publique de `GET /panel/info`, qui sert à reconnaître un relais.
struct RelayInfo: Equatable, Sendable {
    var version: String
    var api: Int
    var remote: Bool
    var features: [String]
}

/// Mode relais : JSON en entrée et en sortie, session par cookie `bp_sid`,
/// en-tête `X-Panel: 1` sur toute requête autre que GET (protection CSRF du relais).
actor RelayClient: PanelBackend {
    nonisolated let target: Target
    private let origin: String
    private var sid: String?
    private let session: URLSession
    private let liveSession: URLSession
    private let onCookies: @Sendable ([String: String]) -> Void

    init(target: Target, cookies: [String: String], onCookies: @escaping @Sendable ([String: String]) -> Void = { _ in }) {
        self.target = target
        self.origin = target.url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.sid = cookies["bp_sid"]
        self.onCookies = onCookies
        self.session = HTTP.makeSession(timeout: 20)
        // le relais envoie un battement toutes les 20 s : 60 s sans rien = flux mort
        self.liveSession = HTTP.makeSession(timeout: 60)
    }

    deinit {
        session.finishTasksAndInvalidate()
        liveSession.invalidateAndCancel()
    }

    /// Interroge `GET /panel/info`. `nil` si rien ne répond ou si ce n'est pas un relais bbox-panel.
    static func info(at origin: URL, timeout: TimeInterval = 2.5) async -> RelayInfo? {
        guard let url = URL(string: origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/panel/info") else { return nil }
        let session = HTTP.makeSession(timeout: timeout)
        defer { session.finishTasksAndInvalidate() }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await HTTP.send(session, request), response.statusCode == 200,
              let json = try? JSON.parse(data), json["app"].string == "bbox-panel" else { return nil }
        return RelayInfo(version: json["version"].string ?? "?", api: json["api"].int ?? 1,
                         remote: json["remote"] == .bool(true), features: json["features"].array.compactMap(\.string))
    }

    // MARK: Session

    func login(password: String) async throws {
        let (data, response) = try await send(.post, "/panel/login", json: ["password": password, "remember": true])
        let body = (try? JSON.parse(data)) ?? .null
        guard response.statusCode == 200 else {
            if response.statusCode == 401 { throw PanelError.badPassword }
            throw PanelError.from(status: response.statusCode, body: body, remote: false)
        }
        guard sid != nil else { throw PanelError.http(200, "no_cookie") }
    }

    func sessionIsValid() async -> Bool? {
        guard sid != nil else { return false }
        guard let (data, response) = try? await send(.get, "/panel/session"), response.statusCode == 200 else { return nil }
        return (try? JSON.parse(data))?["authenticated"] == .bool(true)
    }

    func logout() async {
        _ = try? await send(.post, "/panel/logout", json: [String: String]())
        sid = nil
        onCookies([:])
    }

    // MARK: Relais vers la Bbox (/api/v1/*)

    func get(_ path: String) async throws -> JSON {
        let (data, response) = try await send(.get, "/api/v1/" + path)
        return try decode(data, response).unwrapped
    }

    @discardableResult
    func write(_ method: HTTPMethod, _ path: String, _ form: BboxForm) async throws -> JSON {
        let (data, response) = try await send(method, "/api/v1/" + path, json: form.jsonObject)
        return try decode(data, response).unwrapped
    }

    // MARK: Fonctions propres au relais (/panel/*)

    @discardableResult
    func panel(_ method: HTTPMethod, _ path: String, _ form: BboxForm? = nil) async throws -> JSON {
        let body: Any? = method == .get ? nil : (form?.jsonObject ?? [String: Any]())
        let (data, response) = try await send(method, path, json: body)
        return try decode(data, response)
    }

    /// Corps JSON imbriqué (préférences, relevé immédiat) : `BboxForm` ne sait écrire qu'un niveau.
    @discardableResult
    func panelJSON(_ method: HTTPMethod, _ path: String, _ body: JSON) async throws -> JSON {
        let (data, response) = try await send(method, path, json: body.anyValue)
        return try decode(data, response)
    }

    /// Flux temps réel `GET /panel/live` : `snapshot` à la connexion, puis `patch` et `events`.
    func liveEvents() -> AsyncThrowingStream<SSEEvent, Error> {
        let request = makeRequest(.get, "/panel/live", accept: "text/event-stream")
        let session = liveSession
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    guard let request else { throw PanelError.invalidURL }
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else { throw PanelError.network }
                    guard http.statusCode == 200 else { throw PanelError.from(status: http.statusCode, body: .null, remote: false) }
                    var parser = SSEParser()
                    var line: [UInt8] = []
                    // découpage à la main : `bytes.lines` saute les lignes vides, qui séparent les évènements SSE
                    for try await byte in bytes {
                        if byte == 0x0A {
                            if line.last == 0x0D { line.removeLast() }
                            if let event = parser.feed(String(decoding: line, as: UTF8.self)) { continuation.yield(event) }
                            line.removeAll(keepingCapacity: true)
                        } else {
                            line.append(byte)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: HTTP.map(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: Interne

    private func decode(_ data: Data, _ response: HTTPURLResponse) throws -> JSON {
        let json = ((try? JSON.parse(data)) ?? .null).fixingText
        guard (200..<300).contains(response.statusCode) else {
            throw PanelError.from(status: response.statusCode, body: json.unwrapped, remote: false)
        }
        return json
    }

    private func makeRequest(_ method: HTTPMethod, _ path: String, json: Any? = nil, accept: String = "application/json") -> URLRequest? {
        guard let url = URL(string: origin + path) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue(accept, forHTTPHeaderField: "Accept")
        if method != .get { request.setValue("1", forHTTPHeaderField: "X-Panel") }
        if let json, let body = try? JSONSerialization.data(withJSONObject: json) {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let sid { request.setValue("bp_sid=\(sid)", forHTTPHeaderField: "Cookie") }
        return request
    }

    private func send(_ method: HTTPMethod, _ path: String, json: Any? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let request = makeRequest(method, path, json: json), let url = request.url else { throw PanelError.invalidURL }
        let (data, response) = try await HTTP.send(session, request)
        if let fresh = HTTP.cookies(from: response, url: url)["bp_sid"] {
            sid = fresh.isEmpty ? nil : fresh
            onCookies(sid.map { ["bp_sid": $0] } ?? [:])
        }
        return (data, response)
    }
}
