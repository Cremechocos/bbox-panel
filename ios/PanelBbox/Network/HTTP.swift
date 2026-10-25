import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET", put = "PUT", post = "POST", delete = "DELETE"
}

enum HTTP {
    /// Session sans stockage automatique de cookies : ils sont gérés à la main et rangés dans le Keychain.
    static func makeSession(timeout: TimeInterval, delegate: URLSessionDelegate? = nil) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.urlCache = nil
        config.timeoutIntervalForRequest = timeout
        config.waitsForConnectivity = false
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }

    static func send(_ session: URLSession, _ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw PanelError.network }
            return (data, http)
        } catch {
            throw map(error)
        }
    }

    static func map(_ error: Error) -> Error {
        if error is PanelError || error is CancellationError { return error }
        if Task.isCancelled { return CancellationError() }
        if let u = error as? URLError {
            switch u.code {
            // .cancelled hors annulation de tâche : le délégué TLS a refusé le certificat
            case .cancelled, .serverCertificateUntrusted, .serverCertificateHasBadDate, .serverCertificateHasUnknownRoot,
                 .serverCertificateNotYetValid, .secureConnectionFailed:
                return PanelError.untrusted
            default: return PanelError.network
            }
        }
        return PanelError.network
    }

    /// Cookies posés par la réponse (`Set-Cookie`), sous forme nom → valeur. Une valeur vide = cookie effacé.
    static func cookies(from response: HTTPURLResponse, url: URL) -> [String: String] {
        var fields: [String: String] = [:]
        for (k, v) in response.allHeaderFields {
            if let k = k as? String, let v = v as? String { fields[k] = v }
        }
        var out: [String: String] = [:]
        for c in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) {
            let expired = c.expiresDate.map { $0 < Date() } ?? false
            out[c.name] = expired ? "" : c.value
        }
        return out
    }

    static func cookieHeader(_ cookies: [String: String]) -> String {
        cookies.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "; ")
    }

    /// Équivalent d'`encodeURIComponent`.
    static func encodeComponent(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics.intersection(CharacterSet(charactersIn: Unicode.Scalar(0)...Unicode.Scalar(127)))
        allowed.insert(charactersIn: "-_.!~*'()")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }
}

/// Limite le nombre de requêtes simultanées (la Bbox ralentit ou coupe au-delà de 3).
actor RequestLimiter {
    private let limit: Int
    private var active = 0
    private var waiters: [CheckedContinuation<Void, Never>] = []

    init(limit: Int) { self.limit = limit }

    func acquire() async {
        if active < limit { active += 1; return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func release() {
        // la place libérée passe directement au suivant : `active` ne change pas
        if waiters.isEmpty { active -= 1 } else { waiters.removeFirst().resume() }
    }

    nonisolated func run<T: Sendable>(_ operation: @Sendable () async throws -> T) async throws -> T {
        await acquire()
        do {
            let value = try await operation()
            await release()
            return value
        } catch {
            await release()
            throw error
        }
    }
}
