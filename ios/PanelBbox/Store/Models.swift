import Foundation

/// Appareil de la liste `hosts` de la Bbox.
struct Host: Identifiable, Equatable {
    let json: JSON
    var guest = false

    var id: Int { json["id"].int ?? 0 }
    var mac: String { (json["macaddress"].string ?? "").lowercased() }
    var ip: String { json["ipaddress"].string ?? "" }
    var active: Bool { json["active"].isOn }
    var link: String { json["link"].string ?? "" }
    var isEthernet: Bool { link.localizedCaseInsensitiveContains("ethernet") }
    var isWifi: Bool { link.localizedCaseInsensitiveContains("wifi") }
    var isRepeater: Bool { (json["devicetype"].string ?? "").lowercased() == "repeater" }
    var preferred: Bool { json["preferred"].isOn }
    /// Soumis aux plages horaires du contrôle parental.
    var scheduled: Bool { json["parentalcontrol"]["enable"].isOn }
    var manufacturer: String? { json["informations"]["manufacturer"].string.flatMap { $0.isEmpty ? nil : $0 } }
    var firstSeen: String? { json["firstseen"].string }
    var lastSeenSeconds: Int { json["lastseen"].int ?? 0 }

    /// Même règle que `displayName` du panel web, sans les noms d'affichage du relais.
    var name: String { displayName(aliases: [:]) }

    /// `displayName` du panel web : un nom libre choisi dans le panel (accents, espaces) s'applique tant que
    /// le nom côté Bbox est bien sa conversion ; sinon nom de la Bbox, « Décodeur Bbox TV », fabricant, MAC.
    func displayName(aliases: [String: String]) -> String {
        if let alias = aliases[mac], !alias.isEmpty {
            let slug = Host.bboxHostname(alias)
            if !slug.isEmpty, [json["hostname"].string, json["userfriendlyname"].string].contains(slug) { return alias }
        }
        let n = json["userfriendlyname"].string.flatMap { $0.isEmpty ? nil : $0 } ?? json["hostname"].string ?? ""
        if n.range(of: "^BboxTV", options: [.regularExpression, .caseInsensitive]) != nil { return "Décodeur Bbox TV" }
        if !n.isEmpty { return n }
        if let m = manufacturer { return "Appareil \(m)" }
        return mac.isEmpty ? "Appareil" : mac
    }

    var rssi: Int? {
        let values = ([json["wireless"]["rssi0"]] + json["wirelessByBand"].array.map { $0["rssi0"] }).compactMap(\.int).filter { $0 < 0 }
        return values.max()
    }

    var connectionLabel: String {
        let l = link, b = json["wireless"]["band"].string ?? ""
        if l.localizedCaseInsensitiveContains("MLO") { return "Wi-Fi 7" }
        if isEthernet { return "Ethernet" }
        if b.hasPrefix("6") || l.localizedCaseInsensitiveContains("wifi 6") { return "6 GHz" }
        if b.hasPrefix("5") || l.localizedCaseInsensitiveContains("wifi 5") { return "5 GHz" }
        if b.hasPrefix("2") || l.contains("2.4") || l.contains("24") { return "2,4 GHz" }
        if l.localizedCaseInsensitiveContains("offline") { return "Wi-Fi" }
        return l.isEmpty ? "—" : l
    }

    /// Icône de la famille d'appareil (`deviceKind` + `KIND_ICON` du panel web).
    var kindIcon: String {
        let icon = (json["informations"]["icon"].string ?? "").lowercased()
        let host = (json["hostname"].string ?? "").lowercased()
        func m(_ s: String, _ pattern: String) -> Bool { s.range(of: pattern, options: .regularExpression) != nil }
        if m(icon, "phone") || m(host, "iphone|galaxy|pixel|android|redmi|xiaomi") { return "smartphone" }
        if m(icon, "watch") || m(host, "watch") { return "watch" }
        if m(icon, "laptop|computer|desktop|server") || m(host, "^mac|macbook|desktop-|laptop|pc-|frbou") { return "laptop" }
        if m(icon, "tablet") || m(host, "ipad|tab") { return "tablet" }
        if m(icon, "stb|tv|streaming") || m(host, "bboxtv|tv|chromecast|appletv") { return "tv" }
        if m(icon, "audio|voice|speaker") || m(host, "nest|echo|sonos|homepod") { return "speaker" }
        if m(icon, "printer") { return "printer" }
        if m(icon, "game") || m(host, "playstation|xbox|switch") { return "gamepad-2" }
        if m(icon, "home|thermostat|light|outlet|sensor|camera") { return "lightbulb" }
        return "monitor-smartphone"
    }

    var band: String { json["wireless"]["band"].string ?? "" }
    /// Débit estimé du lien Wi-Fi (Mbit/s), 10 000 pour l'Ethernet (tri « les plus rapides » du web).
    /// Débit du lien (`rateOf` de views/devices.tsx) : estimation Wi-Fi, sinon vitesse du port Ethernet.
    var rate: Double {
        if let r = json["wireless"]["estimatedRate"].double, r != 0 { return r }
        return isEthernet ? json["ethernet"]["speed"].double ?? 0 : 0
    }

    static func signal(_ rssi: Int?) -> (bars: Int, label: String) {
        guard let r = rssi, r != 0 else { return (0, "—") }
        if r >= -55 { return (4, "Excellent") }
        if r >= -65 { return (3, "Bon") }
        if r >= -75 { return (2, "Moyen") }
        return (1, "Faible")
    }

    /// La Bbox n'accepte comme nom que [A-Za-z0-9_-], 48 caractères au plus (`bboxHostname` du panel web).
    static func bboxHostname(_ value: String) -> String {
        var s = value.replacingOccurrences(of: "œ", with: "oe").replacingOccurrences(of: "Œ", with: "OE")
            .replacingOccurrences(of: "æ", with: "ae").replacingOccurrences(of: "Æ", with: "AE").replacingOccurrences(of: "ß", with: "ss")
        s = s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }.map(String.init).joined()
        s = s.replacingOccurrences(of: "[^A-Za-z0-9_-]+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "^-+|-+$", with: "", options: .regularExpression)
        s = String(s.prefix(48))
        return s.replacingOccurrences(of: "-+$", with: "", options: .regularExpression)
    }
}

/// Minuteur du relais (pause d'un appareil ou Wi-Fi invité temporaire).
struct PanelTimer: Equatable {
    let json: JSON
    var type: String { json["type"].string ?? "" }
    var mac: String { (json["mac"].string ?? "").lowercased() }
    var until: Date { Date(timeIntervalSince1970: (json["until"].double ?? 0) / 1000) }
}

/// Évènement du journal du relais.
struct PanelEvent: Identifiable, Equatable {
    let json: JSON
    var id: String { json["id"].string ?? UUID().uuidString }
    var type: String { json["type"].string ?? "" }
    var ack: Bool { json["ack"] == .bool(true) }
    var t: Double { json["t"].double ?? 0 }

    func acked() -> PanelEvent { PanelEvent(json: json.merging(["ack": true])) }

    /// Libellé, icône et ton (`eventInfo` de web/src/lib/events.ts).
    func info(_ name: (String) -> String?) -> (icon: String, tone: Tone, title: String, sub: String?, cat: String) {
        let mac = (json["mac"].string ?? "").lowercased()
        let n = name(mac) ?? self.name ?? json["mac"].string ?? "Un appareil"
        let ip = json["ip"].string, detail = json["detail"]
        let d = detail.string ?? ""
        func at(_ v: JSON) -> String {
            if let ms = v.double { return Fmt.time(Date(timeIntervalSince1970: ms / 1000)) }
            if let s = v.string, let date = ISO8601DateFormatter().date(from: s) { return Fmt.time(date) }
            return ""
        }
        func dur(_ v: JSON) -> String {
            let s = Int(((v.double ?? 0) / 1000).rounded())
            guard s > 0 else { return "" }
            if s < 60 { return "\(s) s" }
            let m = Int((Double(s) / 60).rounded())
            if m < 60 { return "\(m) min" }
            return "\(m / 60) h \(String(format: "%02d", m % 60))"
        }
        func join(_ parts: [String?]) -> String? { let p = parts.compactMap { $0 }.filter { !$0.isEmpty }; return p.isEmpty ? nil : p.joined(separator: " · ") }
        switch type {
        case "arrive": return ("arrowright", .ok, "\(n) s’est connecté", ip, "presence")
        case "leave": return ("logout", .neutral, "\(n) s’est déconnecté", ip, "presence")
        case "new_device": return ("userplus", .warn, "Nouvel appareil : \(n)", "Première connexion à votre réseau", "alert")
        case "internet_down": return ("globe", .danger, "Coupure d’Internet détectée", "Plus aucune réponse des serveurs de test", "alert")
        case "internet_up": return ("globe", .ok, "Internet est revenu", detail.isNull ? nil : "Coupure de \(dur(detail))", "alert")
        case "wan_down": return ("fiber", .danger, "Lien fibre coupé", nil, "alert")
        case "wan_up": return ("fiber", .ok, "Connexion Internet établie", d.isEmpty ? nil : "Adresse \(d)", "system")
        case "temp_high": return ("thermo", .warn, "Température élevée de la Bbox", detail.double.map { "\(Int($0.rounded())) °C" }, "alert")
        case "reboot": return ("power", .neutral, "La Bbox a redémarré", nil, "system")
        case "login": return ("lock", .neutral, "Connexion à l’administration", join([self.name, ip]), "system")
        case "login_failed": return ("lock", .warn, "Mot de passe d’administration refusé", join([self.name, ip]), "alert")
        case "login_locked": return ("lock", .danger, "Administration verrouillée après trop d’essais", nil, "alert")
        case "login_remote": return ("globe", .warn, "Connexion à distance à l’administration", ip, "alert")
        case "login_support": return ("user", .neutral, "Connexion du service client Bouygues", nil, "system")
        case "voip_up": return ("phone", .ok, "Ligne téléphonique enregistrée", nil, "system")
        case "voip_down": return ("phone", .warn, "Ligne téléphonique indisponible", nil, "alert")
        case "upgrade_start": return ("refresh", .neutral, "Mise à jour de la Bbox en cours", nil, "system")
        case "upgrade": return ("check", .ok, "Mise à jour de la Bbox terminée", nil, "system")
        case "wifi_restart": return ("wifi", .neutral, "Redémarrage du Wi-Fi", nil, "system")
        case "wifi_up": return ("wifi", .ok, "Wi-Fi activé", nil, "system")
        case "wifi_down": return ("wifi", .warn, "Wi-Fi coupé", nil, "system")
        case "port_up": return ("ethernet", .neutral, "Câble branché sur le port \(d)".trimmingCharacters(in: .whitespaces), nil, "system")
        case "port_down": return ("ethernet", .neutral, "Câble débranché du port \(d)".trimmingCharacters(in: .whitespaces), nil, "system")
        case "pause_start": return ("pause", .warn, "\(n) mis en pause", detail.isNull ? nil : "jusqu’à \(at(detail))", "action")
        case "pause_end": return ("play", .ok, "Fin de la pause de \(n)", d == "expired" ? "Durée écoulée" : "Reprise manuelle", "action")
        case "guest_on": return ("link", .neutral, "Wi-Fi invité activé", detail.isNull ? nil : "jusqu’à \(at(detail))", "action")
        case "guest_off": return ("link", .neutral, "Wi-Fi invité coupé", d == "expired" ? "Durée écoulée" : nil, "action")
        default: return ("info", .neutral, type, nil, "system")
        }
    }
    var date: Date { Date(timeIntervalSince1970: (json["t"].double ?? 0) / 1000) }
    var level: String { json["level"].string ?? "info" }
    var name: String? { json["name"].string.flatMap { $0.isEmpty ? nil : $0 } }

}

/// Formats d'affichage (repris de `web/src/lib/format.ts`).
enum Fmt {
    private static let fr = Locale(identifier: "fr_FR")
    private static let nnbsp = "\u{202F}"

    static func number(_ v: Double, digits: Int = 0) -> String {
        v.formatted(.number.precision(.fractionLength(digits)).locale(fr))
    }

    /// La Bbox exprime les débits en kbit/s.
    static func kbps(_ v: Double) -> String {
        if v >= 1_000_000 { return number(v / 1_000_000, digits: v >= 10_000_000 ? 0 : 1) + nnbsp + "Gb/s" }
        if v >= 1000 { return number(v / 1000, digits: v >= 100_000 ? 0 : 1) + nnbsp + "Mb/s" }
        return number(v) + nnbsp + "kb/s"
    }

    static func bytes(_ v: Double) -> String {
        let units = ["o", "Ko", "Mo", "Go", "To"]
        var n = v, i = 0
        while n >= 1000 && i < units.count - 1 { n /= 1000; i += 1 }
        return number(n, digits: n >= 100 || i == 0 ? 0 : 1) + nnbsp + units[i]
    }

    static func duration(_ seconds: Int) -> String {
        let s = max(0, seconds), d = s / 86400, h = (s % 86400) / 3600, m = (s % 3600) / 60
        if d > 0 { return "\(d)\(nnbsp)j \(h)\(nnbsp)h" }
        if h > 0 { return "\(h)\(nnbsp)h \(String(format: "%02d", m))" }
        if m > 0 { return "\(m)\(nnbsp)min" }
        return "\(s)\(nnbsp)s"
    }

    static func ms(_ v: Double?) -> String {
        guard let v else { return "—" }
        return number(v, digits: v < 10 ? 1 : 0) + nnbsp + "ms"
    }

    static func relative(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = fr
        f.unitsStyle = .short
        return f.localizedString(for: date, relativeTo: Date())
    }

    static func time(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(fr))
    }

    static func dateTime(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(fr))
    }

    /// Débit en Mbit/s (liens Wi-Fi des appareils, `mbps` du web).
    static func mbps(_ v: Double) -> String {
        v >= 1000 ? number(v / 1000, digits: 1) + nnbsp + "Gb/s" : number(v) + nnbsp + "Mb/s"
    }

    /// « à l’instant », « il y a 5 min », « il y a 3 j », puis la date (`relative` du web).
    static func relativeShort(_ d: Date) -> String {
        let diff = Date().timeIntervalSince(d)
        if diff < 60 { return "à l’instant" }
        if diff < 3600 { return "il y a \(Int(diff / 60))\(nnbsp)min" }
        if diff < 86400 { return "il y a \(Int(diff / 3600))\(nnbsp)h" }
        if diff < 86400 * 7 { return "il y a \(Int(diff / 86400))\(nnbsp)j" }
        return d.formatted(Date.FormatStyle().day().month(.abbreviated).year().locale(fr))
    }

    /// Date de la Bbox (« 2026-10-24T08:12:00+0200 ») → « 24 oct., 08:12 » ; « — » si absente.
    static func bboxDate(_ s: String?) -> String {
        guard let s, !s.isEmpty, s != "-1", !s.hasPrefix("1970") else { return "—" }
        let fixed = s.replacingOccurrences(of: "([+-]\\d\\d)(\\d\\d)$", with: "$1:$2", options: .regularExpression)
        guard let d = ISO8601DateFormatter().date(from: fixed) else { return "—" }
        return d.formatted(Date.FormatStyle().day().month(.abbreviated).hour(.twoDigits(amPM: .omitted)).minute().locale(fr))
    }

    /// « 14:05 », « demain 07:00 », « samedi 07:00 » (`untilLabel` du web).
    static func until(_ date: Date) -> String {
        let cal = Calendar.current
        let day = cal.isDateInToday(date) ? "" : cal.isDateInTomorrow(date) ? "demain " :
            date.formatted(Date.FormatStyle().weekday(.wide).locale(fr)) + " "
        return day + time(date)
    }

    /// « il y a 5 min », « hier à 14:05 » (`ago` de web/src/lib/events.ts).
    static func ago(_ t: Double) -> String {
        let s = max(0, Date().timeIntervalSince1970 - t / 1000)
        if s < 60 { return "à l’instant" }
        if s < 3600 { return "il y a \(Int((s / 60).rounded())) min" }
        if s < 86400 { return "il y a \(Int((s / 3600).rounded())) h" }
        return day(t).lowercased() + " à " + time(Date(timeIntervalSince1970: t / 1000))
    }

    /// « Aujourd’hui », « Hier », « Samedi 24 octobre » (`evDay`).
    static func day(_ t: Double) -> String {
        let d = Date(timeIntervalSince1970: t / 1000), cal = Calendar.current
        if cal.isDateInToday(d) { return "Aujourd’hui" }
        if cal.isDateInYesterday(d) { return "Hier" }
        let s = d.formatted(Date.FormatStyle().weekday(.wide).day().month(.wide).locale(fr))
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    /// Salutation selon l'heure (`hello`).
    static func hello() -> String {
        let h = Calendar.current.component(.hour, from: Date())
        return h < 5 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir"
    }

    /// « 1 appareil », « 3 appareils » (0 et 1 au singulier).
    static func plural(_ n: Int, _ one: String, _ many: String? = nil) -> String { "\(n) \(abs(n) >= 2 ? (many ?? one + "s") : one)" }

    static func pct(_ v: Double) -> String { number(v) + nnbsp + "%" }

    /// Libellé de bande (`bandLabel`).
    static func band(_ link: String, _ band: String) -> String {
        let l = link, b = band
        func m(_ s: String, _ p: String) -> Bool { s.range(of: p, options: [.regularExpression, .caseInsensitive]) != nil }
        if m(l, "MLO") { return "Wi-Fi 7" }
        if m(l, "Ethernet") { return "Ethernet" }
        if b.hasPrefix("6") || m(l, "Wifi 6") { return "6 GHz" }
        if b.hasPrefix("5") || m(l, "Wifi 5") { return "5 GHz" }
        if m(b, "^2(\\.4|4)?$|^2\\.4") || m(l, "2\\.4|24") { return "2,4 GHz" }
        if m(l, "offline") { return "Wi-Fi" }
        return l.isEmpty ? "—" : l
    }

    /// `WIFI:T:WPA;S:<ssid>;P:<mot de passe>;;` (format lu par l'appareil photo des téléphones).
    static func wifiQR(ssid: String, passphrase: String?, security: String?) -> String {
        func esc(_ s: String) -> String { s.replacingOccurrences(of: "([\\\\;,:\"])", with: "\\\\$1", options: .regularExpression) }
        let sec = security ?? ""
        let t = sec.isEmpty || sec.localizedCaseInsensitiveContains("none") ? "nopass" : sec.localizedCaseInsensitiveContains("WEP") ? "WEP" : "WPA"
        return "WIFI:T:\(t);S:\(esc(ssid));" + (t == "nopass" ? "" : "P:\(esc(passphrase ?? ""));") + ";"
    }
}
