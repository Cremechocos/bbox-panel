import Foundation

/// Recherche d'un relais sur le réseau local, et validation des adresses saisies ou scannées.
enum Discovery {
    static let relayPort = 8484

    /// Adresse saisie (« 192.168.1.42:8484 », « http://nas.local:8484/ »…) → origine du relais.
    static func relayOrigin(from text: String) -> URL? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if !s.contains("://") { s = "http://" + s }
        guard var c = URLComponents(string: s), let scheme = c.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = c.host, !host.isEmpty else { return nil }
        c.scheme = scheme
        if c.port == nil && scheme == "http" && !text.contains("://") { c.port = relayPort }
        c.path = ""; c.query = nil; c.fragment = nil; c.user = nil; c.password = nil
        return c.url
    }

    /// Lien de jumelage `bboxpanel://pair?url=<origine encodée>` (QR code du panel web).
    static func pairingOrigin(from link: URL) -> URL? {
        guard link.scheme?.lowercased() == "bboxpanel", link.host?.lowercased() == "pair",
              let value = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "url" })?.value,
              value.contains("://") else { return nil }
        return relayOrigin(from: value)
    }

    /// Adresse privée (réseau de la maison) : le relais est alors « local », sinon « distant ».
    static func isLocal(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        if host.hasSuffix(".local") || host == "localhost" || !host.contains(".") { return true }
        let p = host.split(separator: ".").compactMap { Int($0) }
        guard p.count == 4 else { return false }
        return p[0] == 10 || p[0] == 127 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && (16...31).contains(p[1])) || (p[0] == 169 && p[1] == 254)
    }

    /// Adresses IPv4 privées des interfaces de l'appareil (Wi-Fi d'abord).
    static func localIPv4() -> [String] {
        var out: [(String, String)] = []
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return [] }
        defer { freeifaddrs(list) }
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let ifa = ptr.pointee
            guard let addr = ifa.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET), (ifa.ifa_flags & UInt32(IFF_UP)) != 0,
                  (ifa.ifa_flags & UInt32(IFF_LOOPBACK)) == 0 else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let ip = String(cString: host)
            if let url = URL(string: "http://\(ip)"), isLocal(url), !ip.hasPrefix("169.254.") {
                out.append((String(cString: ifa.ifa_name), ip))
            }
        }
        return out.sorted { ($0.0 == "en0" ? 0 : 1) < ($1.0 == "en0" ? 0 : 1) }.map(\.1)
    }

    /// Parcourt le /24 de l'appareil sur le port du relais et s'arrête au premier `/panel/info` valide.
    /// L'adresse de l'appareil lui-même passe en premier (simulateur, ou relais lancé sur la même machine).
    static func scanForRelay(timeout: TimeInterval = 1.2, parallel: Int = 48) async -> URL? {
        var candidates: [String] = []
        for ip in localIPv4() {
            let parts = ip.split(separator: ".")
            guard parts.count == 4 else { continue }
            let prefix = parts.prefix(3).joined(separator: ".")
            candidates.append(ip)
            candidates += (1...254).map { "\(prefix).\($0)" }.filter { $0 != ip }
        }
        var seen = Set<String>()
        let urls = candidates.filter { seen.insert($0).inserted }.compactMap { URL(string: "http://\($0):\(relayPort)") }
        guard !urls.isEmpty else { return nil }

        return await withTaskGroup(of: URL?.self) { group in
            var next = 0
            func add() {
                guard next < urls.count else { return }
                let url = urls[next]
                next += 1
                group.addTask { await RelayClient.info(at: url, timeout: timeout) != nil ? url : nil }
            }
            for _ in 0..<min(parallel, urls.count) { add() }
            while let result = await group.next() {
                if let found = result { group.cancelAll(); return found }
                add()
            }
            return nil
        }
    }
}
