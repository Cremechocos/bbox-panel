import Foundation
import Observation

struct Toast: Identifiable, Equatable {
    let id = UUID()
    var text: String
    var isError: Bool
}

/// Préférences partagées du relais (`/panel/prefs`) : favoris, noms d'affichage, prénom de l'accueil.
struct Prefs: Equatable {
    var favDevices: [String] = []
    var favActions: [String] = []
    var names: [String: String] = [:]
    var owner = ""

    init() {}
    init(json: JSON) {
        favDevices = json["favorites"]["devices"].array.compactMap(\.string)
        favActions = json["favorites"]["actions"].array.compactMap(\.string)
        names = (json["names"].object ?? [:]).compactMapValues(\.string)
        owner = json["owner"].string ?? ""
    }
}

/// État du tableau de bord, calqué sur `LiveState` du panel web (`web/src/lib/live.ts`).
/// Mode relais : alimenté par le flux SSE `/panel/live`.
/// Mode direct : relevé périodique des routes de la Bbox (3 requêtes simultanées au plus, via BboxClient).
@MainActor @Observable
final class PanelStore {
    let backend: any PanelBackend
    var target: Target { backend.target }
    var isRelay: Bool { target.isRelay }

    /// Clés d'état du relais telles quelles (`device`, `wanIp`, `wireless`, `sff`, `sessions`, `probes`…).
    var raw: [String: JSON] = [:]
    /// Séries temps réel horodatées (`latency`, `down`, `up`, `hostsActive`, `p:<service>`…).
    var series: [String: [Pt]] = [:]
    var hosts: [Host] = []
    var guestHosts: [Host] = []
    var dhcpClients: [JSON] = []
    var timers: [PanelTimer] = []
    var events: [PanelEvent] = []
    var unread = 0
    var prefs = Prefs()

    // Mesures du mode direct (le relais les fournit dans `raw`)
    private var directWan: [String: JSON] = [:]
    private var directCPU: [String: JSON] = [:]
    private var directMem: [String: JSON] = [:]

    var loaded = false
    var liveConnected = false
    /// Routes refusées par la Bbox jointe à distance (affichées « Indisponible à distance »).
    var forbidden: Set<String> = []
    var toast: Toast?
    var onAuthLost: (() -> Void)?

    private var task: Task<Void, Never>?
    private var previousCPU: (busy: Double, all: Double)?
    /// Décalage d'horloge entre le relais et l'iPhone (comme `skew` du web).
    private var skew: Double = 0

    /// Plafonds des séries (`CAP` de live.ts).
    private static let caps: [String: Int] = ["latency": 300, "lan": 300, "down": 120, "up": 120, "cpu": 150, "temp": 150, "mem": 150,
                                              "b24": 150, "b5": 150, "b6": 150, "sessions": 90, "hostsActive": 90]

    init(backend: any PanelBackend) {
        self.backend = backend
    }

    // MARK: Cycle de vie

    func start() {
        guard task == nil else { return }
        if let relay = backend as? RelayClient {
            task = Task { await runLive(relay) }
            Task { await loadPrefs() }
        } else {
            task = Task { await runPolling() }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
        liveConnected = false
    }

    // MARK: Accès typés (racines déballées, comme renvoyées par la Bbox)

    var device: JSON { raw["device"] ?? .null }
    var dev: JSON { device["device"] }
    var wanIP: JSON { raw["wanIp"] ?? .null }
    var wan: JSON { wanIP["wan"] }
    var summary: JSON { raw["summary"] ?? .null }
    var wireless: JSON { raw["wireless"] ?? .null }
    var w: JSON { wireless["wireless"] }

    var wanRate: JSON { raw["wan"] ?? .object(directWan) }
    var down: Double { wanRate["down"].double ?? 0 }
    var up: Double { wanRate["up"].double ?? 0 }
    var contractDown: Double { wanRate["contract"].double ?? 0 }
    var contractUp: Double { wanRate["contractUp"].double ?? 0 }
    var cpu: JSON { raw["cpu"] ?? .object(directCPU) }
    var cpuUsage: Double { cpu["usage"].double ?? 0 }
    var temperature: Double { cpu["temp"].double ?? 0 }
    var mem: JSON { raw["mem"] ?? .object(directMem) }
    var memPercent: Double {
        let total = mem["total"].double ?? 0
        return total > 0 ? (mem["used"].double ?? 0) / total * 100 : 0
    }
    var latencyState: JSON { raw["latency"] ?? .null }
    var latency: Double? { latencyState["internet"].double }
    var jitter: Double { latencyState["jitter"].double ?? 0 }
    var loss: Double { latencyState["loss"].double ?? 0 }
    var today: JSON { raw["today"] ?? .null }
    var graphs: JSON { raw["graphs"] ?? .null }
    var bands: JSON { raw["bands"] ?? .null }

    func points(_ name: String) -> [Pt] { series[name] ?? [] }

    var wifiOn: Bool { w["radio"]["24"]["enable"].int == 1 || w["radio"]["5"]["enable"].int == 1 }
    var guestOn: Bool { (summary["wireless"]["guestenable"].isNull ? w["ssid"]["guest"]["enable"] : summary["wireless"]["guestenable"]).int == 1 }
    var preferredAvailable: Bool { summary["preferredAvailable"].int == 1 }
    var guestTimer: PanelTimer? { timers.first { $0.type == "guest" } }
    func pauseTimer(for host: Host) -> PanelTimer? { timers.first { $0.type == "pause" && $0.mac == host.mac } }
    func host(mac: String) -> Host? { hosts.first { $0.mac == mac.lowercased() } }
    func name(of host: Host) -> String { host.displayName(aliases: prefs.names) }

    /// Internet joignable ? Même règle qu'`internetOk` du panel web.
    var internetOK: Bool {
        if latencyState["down"].isOn || latencyState["down"] == .bool(true) { return false }
        let st = summary["internet"]["state"].int ?? wan["internet"]["state"].int
        if st == 2 { return true }
        if st == 0 || st == 1 { return false }
        return (wan["ip"]["state"].string ?? "").lowercased() == "up" || latency != nil
    }

    var degraded: Bool { internetOK && (loss >= 10 || (latency ?? 0) > 120) }

    // MARK: Mode relais (SSE)

    private func runLive(_ relay: RelayClient) async {
        while !Task.isCancelled {
            do {
                for try await event in await relay.liveEvents() {
                    handle(event)
                }
            } catch PanelError.authRequired {
                authLost()
                return
            } catch {
                if Task.isCancelled { return }
            }
            liveConnected = false
            // flux coupé : session perdue ? sinon on se reconnecte (même délai que `retry: 3000`)
            if await relay.sessionIsValid() == false { authLost(); return }
            try? await Task.sleep(for: .seconds(3))
        }
    }

    func handle(_ event: SSEEvent) {
        guard let json = try? JSON.parse(Data(event.data.utf8)).fixingText else { return }
        switch event.event {
        case "snapshot":
            if let t = json["t"].double { skew = Date().timeIntervalSince1970 * 1000 - t }
            apply(json["state"])
            for (name, pts) in json["series"].object ?? [:] { series[name] = pts.array.map(point) }
            events = json["events"].array.map(PanelEvent.init)
            unread = json["unread"].int ?? 0
            liveConnected = true
            loaded = true
        case "patch":
            apply(json["s"])
            for (name, pts) in json["p"].object ?? [:] {
                var arr = series[name] ?? []
                arr.append(contentsOf: pts.array.map(point))
                let cap = Self.caps[name] ?? (name.hasPrefix("p:") ? 300 : 120)
                if arr.count > cap { arr.removeFirst(arr.count - cap) }
                series[name] = arr
            }
            liveConnected = true
            // le relevé du relais repasse en « public » : notre session Bbox a peut-être expiré
            if json["s"]["auth"].string == "public" { Task { await checkSession() } }
        case "events":
            let fresh = json["events"].array.map(PanelEvent.init).filter { e in !events.contains { $0.id == e.id } }
            events = Array((fresh + events).sorted { $0.date > $1.date }.prefix(120))
            if let n = json["unread"].int { unread = n }
        default: break
        }
    }

    private func point(_ j: JSON) -> Pt { Pt(t: (j["t"].double ?? 0) + skew, v: j["v"].double) }

    /// Applique les clés d'état du relais (`state` du snapshot ou `s` d'un patch).
    private func apply(_ state: JSON) {
        for (key, value) in state.object ?? [:] {
            raw[key] = value
            switch key {
            case "hosts": hosts = value.array.map { Host(json: $0) }
            case "guestHosts": guestHosts = value.array.map { Host(json: $0, guest: true) }
            case "dhcp": dhcpClients = value["dhcp"]["clients"].array
            case "timers": timers = value.array.map(PanelTimer.init)
            default: break
            }
        }
    }

    private func checkSession() async {
        if await backend.sessionIsValid() == false { authLost() }
    }

    // MARK: Préférences (relais)

    func loadPrefs() async {
        guard let relay else { return }
        if let p = try? await relay.panel(.get, "/panel/prefs") { prefs = Prefs(json: p) }
    }

    func setFavorites(devices: [String]? = nil, actions: [String]? = nil) async {
        guard let relay else { return }
        let before = prefs
        if let devices { prefs.favDevices = devices }
        if let actions { prefs.favActions = actions }
        do {
            try await relay.panelJSON(.put, "/panel/prefs", ["favorites": ["devices": JSON(prefs.favDevices), "actions": JSON(prefs.favActions)]])
        } catch {
            prefs = before
            toast = Toast(text: (error as? LocalizedError)?.errorDescription ?? "Action impossible.", isError: true)
        }
    }

    func toggleFavorite(_ host: Host) async {
        var list = prefs.favDevices
        let on = !list.contains(host.mac)
        if on { list.append(host.mac) } else { list.removeAll { $0 == host.mac } }
        await setFavorites(devices: list)
        if prefs.favDevices == list { toast = Toast(text: on ? "\(name(of: host)) ajouté aux favoris" : "\(name(of: host)) retiré des favoris", isError: false) }
    }

    func setOwner(_ value: String) async {
        guard let relay else { return }
        let owner = String(value.trimmingCharacters(in: .whitespaces).prefix(32))
        guard owner != prefs.owner else { return }
        let before = prefs
        prefs.owner = owner
        do { try await relay.panelJSON(.put, "/panel/prefs", ["owner": .string(owner)]) } catch { prefs = before }
    }

    // MARK: Mode direct (relevé périodique)

    private func runPolling() async {
        var tick = 0
        while !Task.isCancelled {
            // tout toutes les 30 s, débit et santé toutes les 5 s
            if tick % 6 == 0 { await loadAll() } else { await loadFast() }
            tick += 1
            try? await Task.sleep(for: .seconds(5))
        }
    }

    /// Relevé complet (aussi appelé par « tirer pour actualiser »).
    func refresh() async {
        if let relay {
            // le relais relève tout de suite ce qu'on lui demande ; on relit aussi les baux DHCP (renommage)
            _ = try? await relay.panelJSON(.post, "/panel/live/refresh", ["tasks": ["hosts", "statics", "summary"]])
            if let d = await fetch("dhcp/clients") { dhcpClients = d["dhcp"]["clients"].array }
            await loadPrefs()
        } else {
            await loadAll()
        }
    }

    private func loadAll() async {
        async let s = fetch("summary")
        async let wn = fetch("wan/ip")
        async let d = fetch("device")
        async let h = fetch("hosts")
        async let wl = fetch("wireless")
        async let dh = fetch("dhcp/clients")
        let (sum, wanJSON, devJSON, hostList, wifi, dhcp) = await (s, wn, d, h, wl, dh)
        if let sum { raw["summary"] = sum }
        if let wanJSON { raw["wanIp"] = wanJSON }
        if let devJSON { raw["device"] = devJSON }
        if let wifi { raw["wireless"] = wifi }
        if let dhcp { dhcpClients = dhcp["dhcp"]["clients"].array }
        if let hostList {
            // `hosts` renvoie deux éléments : le réseau principal puis le Wi-Fi invité
            let parts = hostList.array.isEmpty ? [hostList] : hostList.array
            hosts = parts.first.map { $0["hosts"]["list"].array.map { Host(json: $0) } } ?? []
            guestHosts = parts.count > 1 ? parts[1]["hosts"]["list"].array.map { Host(json: $0, guest: true) } : []
            push("hostsActive", Double(hosts.filter(\.active).count))
        }
        await loadFast()
        loaded = true
    }

    private func loadFast() async {
        async let st = fetch("wan/ip/stats")
        async let c = fetch("device/cpu")
        async let m = fetch("device/mem")
        let (stats, cpuJSON, memJSON) = await (st, c, m)
        if let s = stats?["wan"]["ip"]["stats"], s.object != nil {
            directWan = ["down": s["rx"]["bandwidth"], "up": s["tx"]["bandwidth"],
                         "contract": s["rx"]["contractualBandwidth"], "contractUp": s["tx"]["contractualBandwidth"],
                         "updatedAt": .number(Date().timeIntervalSince1970 * 1000)]
            push("down", down); push("up", up)
        }
        if let c = cpuJSON?["device"]["cpu"], c.object != nil {
            let t = c["time"]
            let busy = ["user", "nice", "system", "irq", "io"].reduce(0.0) { $0 + (t[$1].double ?? 0) }
            let all = busy + (t["idle"].double ?? 0)
            if let p = previousCPU, all > p.all { directCPU["usage"] = .number(max(0, min(100, (busy - p.busy) / (all - p.all) * 100))) }
            previousCPU = (busy, all)
            if let main = c["temperature"]["main"].double { directCPU["temp"] = .number(main / 1000) }
        }
        if let m = memJSON?["device"]["mem"], m.object != nil {
            let total = m["total"].double ?? 0
            directMem = ["total": .number(total), "used": .number(max(0, total - (m["free"].double ?? 0) - (m["cached"].double ?? 0)))]
        }
    }

    private func push(_ name: String, _ v: Double) {
        var arr = series[name] ?? []
        arr.append(Pt(t: Date().timeIntervalSince1970 * 1000, v: v))
        let cap = Self.caps[name] ?? 120
        if arr.count > cap { arr.removeFirst(arr.count - cap) }
        series[name] = arr
    }

    /// Lecture tolérante : une route absente du firmware ne bloque pas l'écran ; une session perdue, si.
    private func fetch(_ path: String) async -> JSON? {
        do {
            let json = try await backend.get(path)
            forbidden.remove(path)
            return json
        } catch PanelError.remoteForbidden {
            forbidden.insert(path)
            return nil
        } catch PanelError.authRequired {
            authLost()
            return nil
        } catch {
            return nil
        }
    }

    private func authLost() {
        stop()
        onAuthLost?()
    }

    // MARK: Actions

    /// Exécute une action, affiche son résultat et rafraîchit les données.
    @discardableResult
    func run(_ success: String?, refresh tasks: [String] = [], _ operation: @escaping () async throws -> Void) async -> Bool {
        do {
            try await operation()
            if let success { toast = Toast(text: success, isError: false) }
            if let relay, !tasks.isEmpty {
                _ = try? await relay.panelJSON(.post, "/panel/live/refresh", ["tasks": JSON(tasks)])
            } else if !isRelay {
                // en direct, la Bbox applique certains réglages avec un léger délai
                Task { try? await Task.sleep(for: .seconds(1.5)); await loadAll() }
            }
            return true
        } catch PanelError.authRequired {
            authLost()
        } catch is CancellationError {
        } catch {
            toast = Toast(text: (error as? LocalizedError)?.errorDescription ?? "Action impossible.", isError: true)
        }
        return false
    }

    var relay: RelayClient? { backend as? RelayClient }

    @discardableResult
    func setWifi(_ on: Bool) async -> Bool {
        await run(on ? "Wi-Fi activé" : "Wi-Fi coupé", refresh: ["wireless", "statics"]) { [backend] in
            try await backend.write(.put, "wireless", ["radio.enable": .bool(on)])
        }
    }

    /// Wi-Fi invité. Avec le relais, une durée en minutes peut être donnée (coupure automatique) ; 0 = sans limite.
    @discardableResult
    func setGuest(_ on: Bool, minutes: Int = 0) async -> Bool {
        let relay = self.relay
        let until = Date().addingTimeInterval(Double(minutes) * 60)
        let text = on ? (minutes > 0 ? "Wi-Fi invité activé jusqu’à \(Fmt.until(until))" : "Wi-Fi invité activé") : "Wi-Fi invité coupé"
        return await run(text, refresh: ["statics", "summary"]) { [backend] in
            if let relay, on, minutes > 0 {
                try await relay.panel(.post, "/panel/guest", ["until": .int(Int(until.timeIntervalSince1970 * 1000))])
            } else if let relay, !on {
                try await relay.panel(.delete, "/panel/guest")
            } else {
                try await backend.write(.put, "wireless/guestenable", ["enable": .bool(on)])
            }
        }
    }

    /// Réglage Wi-Fi simple (`PUT wireless…`), comme les interrupteurs de la page Wi-Fi du web.
    @discardableResult
    func writeWireless(_ path: String, _ form: BboxForm, ok: String) async -> Bool {
        await run(ok, refresh: ["wireless"]) { [backend] in try await backend.write(.put, path, form) }
    }

    func reboot() async {
        await run("Redémarrage en cours… La Bbox revient dans 2 à 3 minutes.") { [backend] in
            try await backend.write(.post, "device/reboot", [:])
        }
    }

    func wake(_ host: Host) async {
        await run("Signal de réveil envoyé") { [backend] in
            try await backend.write(.post, "hosts/\(host.id)", ["action": "wakeup"])
        }
    }

    @discardableResult
    func setScheduled(_ host: Host, _ on: Bool) async -> Bool {
        await run(on ? "Ajouté aux plages de pause" : "Retiré des plages de pause", refresh: ["hosts"]) { [backend] in
            try await backend.write(.put, "parentalcontrol/hosts", ["enable": .bool(on), "macaddress": .string(host.mac)])
        }
    }

    @discardableResult
    func setPriority(_ host: Host, _ on: Bool) async -> Bool {
        await run(on ? "Appareil prioritaire" : "Priorité retirée", refresh: ["hosts"]) { [backend] in
            try await backend.write(.post, "hosts/prioritize/\(host.id)", ["enable": .bool(on)])
        }
    }

    @discardableResult
    func setBandLock(_ host: Host, _ on: Bool) async -> Bool {
        await run(on ? "Bande figée" : "Bande automatique", refresh: ["hosts"]) { [backend] in
            try await backend.write(.put, "untouchable/hosts/\(host.id)", ["enable": .bool(on)])
        }
    }

    @discardableResult
    func forget(_ host: Host) async -> Bool {
        await run("Appareil retiré", refresh: ["hosts"]) { [backend] in
            try await backend.write(.delete, "hosts/\(host.id)", [:])
        }
    }

    /// Renommage par réservation DHCP (bail fixe), comme l'IHM officielle et le panel web.
    func rename(_ host: Host, to name: String, ip: String) async -> Bool {
        let ok = await run("Appareil renommé", refresh: ["hosts"]) { [backend] in
            let form: BboxForm = ["enable": 1, "hostname": .string(Host.bboxHostname(name)), "ipaddress": .string(ip), "macaddress": .string(host.mac)]
            let clients = try await backend.get("dhcp/clients")["dhcp"]["clients"].array
            if let existing = clients.first(where: { ($0["macaddress"].string ?? "").lowercased() == host.mac || $0["ipaddress"].string == host.ip }),
               let id = existing["id"].int {
                try await backend.write(.put, "dhcp/clients/\(id)", form)
            } else {
                try await backend.write(.post, "dhcp/clients", form)
            }
        }
        // nom d'affichage libre (accents, espaces) mémorisé par le relais, comme `setAlias` du web
        if ok, let relay {
            var names = prefs.names
            if Host.bboxHostname(name) != name { names[host.mac] = name } else { names.removeValue(forKey: host.mac) }
            if names != prefs.names {
                prefs.names = names
                _ = try? await relay.panelJSON(.put, "/panel/prefs", ["names": JSON(names)])
            }
        }
        return ok
    }

    @discardableResult
    func pause(_ host: Host, until: Date) async -> Bool {
        guard let relay else { toast = Toast(text: PanelError.requiresRelay.errorDescription!, isError: true); return false }
        let n = name(of: host)
        return await run("\(n) en pause jusqu’à \(Fmt.until(until))") {
            try await relay.panel(.post, "/panel/pause", ["mac": .string(host.mac), "ip": .string(host.ip == "0.0.0.0" ? "" : host.ip),
                                                          "name": .string(n), "until": .int(Int(until.timeIntervalSince1970 * 1000))])
        }
    }

    @discardableResult
    func resume(_ host: Host) async -> Bool {
        guard let relay else { return false }
        return await run("\(name(of: host)) a de nouveau accès à Internet") {
            try await relay.panel(.delete, "/panel/pause/" + HTTP.encodeComponent(host.mac))
        }
    }

    func ackEvents() async {
        guard let relay else { return }
        if let r = try? await relay.panel(.post, "/panel/events/ack", ["all": true]), let n = r["unread"].int {
            unread = n
            events = events.map { $0.acked() }
        }
    }

    /// Historique des évènements (`GET /panel/events`), pour la page Activité.
    func loadEvents(limit: Int = 300) async -> [PanelEvent]? {
        guard let relay, let r = try? await relay.panel(.get, "/panel/events?limit=\(limit)") else { return nil }
        if let n = r["unread"].int { unread = n }
        return r["events"].array.map(PanelEvent.init)
    }
}
