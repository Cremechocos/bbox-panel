import SwiftUI

/// Accueil : `views/home.tsx` en Bbox Clair (cartes), `views/home-ligne.tsx` en Noir Geist (listes).
struct HomeScreen: View {
    var store: PanelStore
    @State private var week: [JSON] = []
    @Environment(\.palette) private var p

    var body: some View {
        Page(title: "Accueil", refresh: { await store.refresh(); await loadWeek() }) {
            if !store.loaded {
                PageHead(kicker: Fmt.hello(), title: "Accueil")
                LoadingPlaceholder()
            } else if p.isGeist {
                HomeLigne(store: store, week: week)
            } else {
                HomeClair(store: store, week: week)
            }
        }
        .task {
            // consommation des 7 derniers jours (relais), relue toutes les 5 minutes comme le web
            while !Task.isCancelled {
                await loadWeek()
                try? await Task.sleep(for: .seconds(300))
            }
        }
    }

    private func loadWeek() async {
        if let r = try? await store.relay?.panel(.get, "/panel/usage?days=7") { week = r["days"].array }
    }
}

/// Valeurs communes aux deux accueils.
@MainActor private struct HomeData {
    let store: PanelStore
    var active: [Host] { store.hosts.filter(\.active) }
    var guestsOn: Int { store.guestHosts.filter(\.active).count }
    var title: String { !store.internetOK ? "Internet est coupé" : store.degraded ? "Connexion ralentie" : "Tout fonctionne" }
    var alerts: Int { store.summary["alerts"]["count"].int ?? 0 }
    var todayRx: Double { store.today["rx"].double ?? 0 }
    var todayTx: Double { store.today["tx"].double ?? 0 }
    var todayTotal: Double { todayRx + todayTx }
    var linkSummary: String {
        let wifi = active.filter { !$0.isEthernet }.count, eth = active.filter(\.isEthernet).count
        return "\(wifi) en Wi-Fi · \(eth) en Ethernet" + (guestsOn > 0 ? " · \(guestsOn) invité\(guestsOn > 1 ? "s" : "")" : "")
    }
    /// Appareils actifs par bande (`per` du web).
    var perBand: [String: Int] {
        var per = ["24": 0, "5": 0, "6": 0, "mlo": 0]
        for x in active {
            let l = x.link
            if l.contains("MLO") { per["mlo"]! += 1 } else if l.contains("Ethernet") { continue } else if l.contains("Wifi 6") { per["6"]! += 1 } else if l.contains("Wifi 5") { per["5"]! += 1 } else { per["24"]! += 1 }
        }
        return per
    }
    var bands: [(String, String)] { [("24", "2,4 GHz"), ("5", "5 GHz"), ("6", "6 GHz")].filter { !store.w["radio"][$0.0].isNull } }
    func bandRate(_ k: String) -> Double { (store.bands[k]["down"].double ?? 0) + (store.bands[k]["up"].double ?? 0) }
    var favDevices: [Host] { store.prefs.favDevices.compactMap { store.host(mac: $0) } }
    var favActions: [QuickAction] { store.prefs.favActions.compactMap(QuickAction.of) }
    static let recentHidden: Set<String> = ["wifi_restart", "port_up", "port_down", "voip_up", "login"]
    var recent: [PanelEvent] { Array(store.events.filter { !Self.recentHidden.contains($0.type) }.prefix(6)) }

    func latFmt(_ v: Double) -> String { Fmt.number(v, digits: v < 10 ? 1 : 0) }
}

private func wifiConfirm(_ nv: Bool) -> LiveToggle.Confirm? {
    nv ? nil : .init(title: "Couper tout le Wi-Fi ?",
                     message: "Tous les appareils sans fil seront déconnectés, y compris celui-ci s’il est en Wi-Fi. Il faudra un appareil en Ethernet ou le bouton de la Bbox pour le réactiver.",
                     button: "Couper le Wi-Fi")
}

// MARK: - Bbox Clair

private struct HomeClair: View {
    var store: PanelStore
    var week: [JSON]
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p
    @AppStorage("home.chart") private var chart = "lat"
    @State private var sheet: SheetKind?

    enum SheetKind: Identifiable { case favorites, guest, pause(Host); var id: String { switch self { case .favorites: "f"; case .guest: "g"; case .pause(let h): "p\(h.id)" } } }

    var body: some View {
        let d = HomeData(store: store), dev = store.dev
        let owner = store.prefs.owner
        PageHead(kicker: owner.isEmpty ? Fmt.hello() : "\(Fmt.hello()) \(owner)", title: d.title,
                 sub: "\(dev["modelname"].string ?? "Bbox") · firmware \(dev["main"]["version"].string ?? "…") · allumée depuis \(Fmt.duration(dev["uptime"].int ?? 0))")
        StatusPill(ok: store.internetOK).padding(.top, -8).padding(.bottom, 20)

        if d.alerts > 0 {
            Banner(tone: .warn, icon: "alert", text: Text("\(d.alerts) alerte\(d.alerts > 1 ? "s" : "")").bold() + Text(" signalée\(d.alerts > 1 ? "s" : "") par la Bbox."))
                .padding(.bottom, 12)
        }

        // 5 indicateurs : 2 colonnes, le dernier sur toute la largeur
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            Kpi(icon: "globe", label: "Latence Internet", value: store.latency.map(d.latFmt) ?? "—", unit: "ms",
                sub: "gigue \(Fmt.number(store.jitter, digits: store.jitter < 10 ? 1 : 0)) ms · perte \(Int(store.loss)) %") {
                Sparkline(points: Array(store.points("latency").suffix(60)), color: p.lat)
            }
            Kpi(icon: "down", label: "Débit descendant", value: Fmt.kbps(store.down), sub: "contrat \(Fmt.kbps(store.contractDown))") {
                Sparkline(points: Array(store.points("down").suffix(40)), color: p.down)
            }
            Kpi(icon: "up", label: "Débit montant", value: Fmt.kbps(store.up), sub: "contrat \(Fmt.kbps(store.contractUp))") {
                Sparkline(points: Array(store.points("up").suffix(40)), color: p.up)
            }
            Kpi(icon: "devices", label: "Appareils connectés", value: "\(d.active.count)", unit: "/ \(store.hosts.count)", sub: d.linkSummary) {
                Sparkline(points: Array(store.points("hostsActive").suffix(60)), color: p.brand)
            }
        }
        Kpi(icon: "chart", label: "Données aujourd’hui", value: Fmt.bytes(d.todayTotal), sub: "↓ \(Fmt.bytes(d.todayRx)) · ↑ \(Fmt.bytes(d.todayTx))") {
            if week.filter({ $0["has"] == .bool(true) || $0["has"].isOn }).count >= 2 {
                MiniBars(values: week.enumerated().map { i, x in i == week.count - 1 ? d.todayTotal : (x["rx"].double ?? 0) + (x["tx"].double ?? 0) }, color: p.brand)
                    .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 10)
            }
        }
        .padding(.top, 12)
        .padding(.bottom, 12)

        VStack(spacing: 12) {
            InternetLive(store: store, chart: $chart)

            Card("Favoris", icon: "star", action: { Btn("Modifier", kind: .plain, size: .xs) { sheet = .favorites }.padding(.trailing, -6) }) {
                if d.favDevices.isEmpty && d.favActions.isEmpty {
                    VStack(spacing: 0) {
                        EmptyState(icon: "star", title: "Épinglez l’essentiel", text: "Appareils à mettre en pause d’un geste, Wi-Fi invité, carte Wi-Fi… toujours sous la main.")
                            .padding(.bottom, -20)
                        Btn("Choisir des favoris", kind: .soft, size: .sm, icon: "plus") { sheet = .favorites }
                            .padding(.bottom, 16)
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    if !d.favDevices.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(Array(d.favDevices.enumerated()), id: \.element.id) { i, h in favRow(h, first: i == 0) }
                        }
                        .padding(.horizontal, -16).padding(.top, -4)
                    }
                    if !d.favActions.isEmpty {
                        FlowRow {
                            ForEach(d.favActions) { a in ActionButton(store: store, action: a) }
                        }
                        .padding(.top, d.favDevices.isEmpty ? 0 : 14)
                        .overlay(alignment: .top) { if !d.favDevices.isEmpty { Rectangle().fill(p.border).frame(height: 1) } }
                    }
                }
            }

            Card("Latence des services", icon: "globe") {
                if let sum = store.servicesSummary { Note(sum).padding(.top, -10).padding(.bottom, 12) }
                ServicesGrid(store: store)
            }

            WifiCard(store: store, data: d) { sheet = .guest }
            DevicesCard(store: store, data: d)
            HealthCard(store: store)

            Card("Activité récente", icon: "bell", flush: true, action: { CardLink(label: "Toute l’activité") { nav.go(.activite) } }) {
                if d.recent.isEmpty {
                    EmptyState(icon: "bell", title: "Pas encore d’activité", text: "Les arrivées et départs d’appareils, les coupures et les alertes apparaîtront ici en direct.")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(d.recent.enumerated()), id: \.element.id) { i, e in EventRow(store: store, event: e, first: i == 0) }
                    }
                    .padding(.bottom, 4)
                }
            }
            FiberCard(store: store)
        }
        .sheet(item: $sheet) { s in
            Group {
                switch s {
                case .favorites: FavoritesSheet(store: store)
                case .guest: GuestSheet(store: store)
                case .pause(let h): PauseSheet(store: store, host: h)
                }
            }
            .kitSheet()
        }
    }

    private func favRow(_ h: Host, first: Bool) -> some View {
        let pz = store.pauseTimer(for: h)
        let sig = Host.signal(h.rssi)
        return HStack(spacing: 12) {
            Button { nav.device = h } label: {
                Avatar(icon: h.kindIcon, size: .sm, on: h.active, paused: pz != nil)
                VStack(alignment: .leading, spacing: 0) {
                    Text(store.name(of: h)).ui(14.5, .medium).lineLimit(1)
                    Text(pz.map { "en pause jusqu’à \(Fmt.until($0.until))" } ?? (h.active ? (h.isEthernet ? "Ethernet" : sig.label) : "hors ligne"))
                        .ui(13).foregroundStyle(p.mutedForeground).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(PressStyle())
            if pz != nil {
                Btn("Reprendre", kind: .soft, size: .xs, icon: "play") { await store.resume(h) }
            } else {
                Btn("Pause", kind: .soft, size: .xs, icon: "pause") { sheet = .pause(h) }
            }
        }
        .frame(minHeight: 54)
        .padding(.horizontal, 16).padding(.vertical, 8)
        .overlay(alignment: .top) { if !first { Rectangle().fill(p.border).frame(height: 1) } }
    }
}

/// Pastille d'état Internet (`StatusPill` de l'accueil).
struct StatusPill: View {
    var ok: Bool
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: 8) {
            LiveDot(bad: !ok)
            Text(ok ? "Internet connecté" : "Internet coupé").ui(13.5, p.isGeist ? .medium : .semibold)
        }
        .foregroundStyle(ok ? p.ok : p.danger)
        .padding(.horizontal, p.isGeist ? 12 : 14)
        .frame(height: p.isGeist ? 32 : 36)
        .background(ok ? p.okSoft : p.dangerSoft, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 18, style: .continuous))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Indicateur (`Kpi`) : libellé, grande valeur, détail, mini-courbe collée au bas de la carte.
private struct Kpi<Spark: View>: View {
    var icon: String
    var label: String
    var value: String
    var unit: String?
    var sub: String?
    @ViewBuilder var spark: Spark
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                LucideIcon(icon, size: 15).opacity(0.8)
                Text(label).lineLimit(1)
            }
            .ui(12.5, .medium).foregroundStyle(p.mutedForeground)
            (Text(value) + Text(unit.map { " " + $0 } ?? "").font(p.font(size: 12.5, .medium)).foregroundColor(p.mutedForeground))
                .ui(23, .semibold, tracking: -0.025).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .contentTransition(.numericText())
                .padding(.top, 8)
            if let sub { Text(sub).ui(12.5).monospacedDigit().foregroundStyle(p.mutedForeground).lineLimit(2).padding(.top, 4) }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, Spark.self == EmptyView.self ? 16 : 48)
        .overlay(alignment: .bottom) { spark.frame(height: 42) }
        .clipShape(RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous))
        .cardSurface()
        .animation(.easeOut(duration: 0.4), value: value)
    }
}

/// Grande valeur avec libellé (`Stat`).
private struct BigStat: View {
    var label: String
    var value: String
    var unit: String?
    var dot: Color?
    var small = false
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 7) {
                if let dot { Circle().fill(dot).frame(width: 8, height: 8) }
                Text(label)
            }
            .ui(12.5).foregroundStyle(p.mutedForeground)
            (Text(value) + Text(unit.map { " " + $0 } ?? "").font(p.font(size: 14, .medium)).foregroundColor(p.mutedForeground))
                .ui(small ? 24 : 28, .semibold, tracking: -0.03).monospacedDigit().lineLimit(1)
                .contentTransition(.numericText())
        }
    }
}

/// Internet en direct : latence du service choisi ou débit, graphique de 210 pt.
private struct InternetLive: View {
    var store: PanelStore
    @Binding var chart: String
    @AppStorage("lat.target") private var target = "internet"
    @Environment(\.palette) private var p

    var body: some View {
        let info = store.targetInfo(target)
        let st = Services.stats(store.seriesOf(info.id), every: info.every)
        Card(nil, icon: nil, action: { EmptyView() }) {
            HStack(spacing: 12) {
                HStack(spacing: 10) {
                    LucideIcon("activity", size: 18).foregroundStyle(p.brand)
                    Text("Internet en direct").ui(15, .semibold, tracking: -0.01).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Seg(options: [.init(value: "lat", label: "Latence"), .init(value: "wan", label: "Débit")], value: $chart, small: true, block: true)
                    .fixedSize()
            }
            .frame(minHeight: 32)
            .padding(.bottom, 14)
            Group {
                if chart == "lat" {
                    TargetPicker(store: store).padding(.leading, -10).padding(.bottom, 8)
                    HStack(alignment: .bottom, spacing: 28) {
                        BigStat(label: "Maintenant", value: latText(st), unit: "ms", dot: p.lat)
                        BigStat(label: "Médiane 1 min", value: st.med.map { Fmt.number($0, digits: $0 < 10 ? 1 : 0) } ?? "—", unit: "ms", small: true)
                    }
                    .padding(.bottom, 12)
                    LatencyChart(store: store, height: 210)
                    Note("\(info.host) · \(Services.every(info.every)) · \(store.fromBbox ? "depuis la Bbox (trajet entre le serveur du panel et la Bbox retiré)" : "depuis le serveur du panel"). Les traits rouges signalent une mesure perdue.")
                        .padding(.top, 8)
                } else {
                    HStack(alignment: .bottom, spacing: 28) {
                        BigStat(label: "Descendant", value: Fmt.kbps(store.down), dot: p.down)
                        BigStat(label: "Montant", value: Fmt.kbps(store.up), dot: p.up)
                    }
                    .padding(.bottom, 12)
                    LiveChart(series: [.init(data: store.points("down"), color: p.down), .init(data: store.points("up"), color: p.up)],
                              windowMs: 600_000, height: 210, format: Fmt.kbps, lag: 800)
                    Freshness(wan: store.wanRate)
                }
            }
            .transition(.opacity.combined(with: .offset(y: 6)))
            .id(chart)
        }
        .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.32), value: chart)
    }

    private func latText(_ st: ProbeStats) -> String {
        if st.stale { return "—" }
        switch st.last { case .none: return "—"; case .some(.none): return "perdu"; case .some(.some(let v)): return Fmt.number(v, digits: v < 10 ? 1 : 0) }
    }
}

/// « Mesure calculée par la Bbox · actualisée il y a … » : seul ce texte se redessine chaque seconde.
private struct Freshness: View {
    var wan: JSON
    var body: some View {
        if let at = wan["updatedAt"].double, at > 0 {
            TimelineView(.periodic(from: .now, by: 1)) { tl in
                let secs = max(0, Int((tl.date.timeIntervalSince1970 * 1000 - at) / 1000))
                let every = (wan["interval"].double ?? 0) / 1000
                Note("Mesure calculée par la Bbox · actualisée il y a \(secs) s" + (every > 0 ? " · nouvelle valeur toutes les ~\(Int(every.rounded())) s" : ""))
                    .monospacedDigit()
            }
            .padding(.top, 8)
        }
    }
}

private struct WifiCard: View {
    var store: PanelStore
    var data: HomeData
    var openGuest: () -> Void
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p

    var body: some View {
        let w = store.w, per = data.perBand
        Card("Wi-Fi", icon: "wifi", action: { CardLink(label: "Gérer") { nav.go(.wifi) } }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(w["ssid"]["24"]["id"].string ?? "…").ui(18, .semibold, tracking: -0.01)
                    Note((w["unified"].int == 1 ? "Réseau unifié 2,4 · 5 · 6 GHz" : "Bandes séparées") + (w["driverbusy"].isOn ? " · redémarrage en cours…" : ""))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                LiveToggle(value: store.wifiOn, label: "Wi-Fi", confirm: wifiConfirm) { await store.setWifi($0) }
            }
            .padding(.bottom, 14)
            if !data.bands.isEmpty {
                HStack(spacing: 8) {
                    ForEach(data.bands, id: \.0) { k, l in
                        Tile(label: l, value: Fmt.kbps(data.bandRate(k)), extra: Fmt.plural(per[k] ?? 0, "appareil"), horizontalPadding: 10)
                    }
                }
            }
            VStack(spacing: 0) {
                if !w["ssid"]["mlo"].isNull {
                    Row(first: true, minHeight: 52) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Wi-Fi 7").ui(14.5, .medium)
                            Text(w["ssid"]["mlo"]["id"].string ?? "").ui(13).foregroundStyle(p.mutedForeground).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Chip("\(per["mlo"] ?? 0) app.", tone: .ok)
                    }
                }
                Row(first: w["ssid"]["mlo"].isNull, minHeight: 52, action: openGuest) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Wi-Fi invité").ui(14.5, .medium)
                        Text(store.guestOn ? (store.guestTimer.map { "actif jusqu’à \(Fmt.until($0.until))" } ?? "actif sans limite") : "désactivé")
                            .ui(13).foregroundStyle(p.mutedForeground).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Chip(store.guestOn ? "Actif" : "Inactif", tone: store.guestOn ? .ok : .off, dot: true)
                    LucideIcon("chevron", size: 18).foregroundStyle(p.mutedForeground)
                }
            }
            .padding(.horizontal, -16)
            .padding(.top, 12)
            .padding(.bottom, -16)
            .overlay(alignment: .top) { Rectangle().fill(p.border).frame(height: 1).padding(.horizontal, -16).padding(.top, 12) }
        }
    }
}

private struct DevicesCard: View {
    var store: PanelStore
    var data: HomeData
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p

    var body: some View {
        let active = data.active
        var kinds = (w24: 0, w5: 0, w6: 0, mlo: 0, eth: 0)
        for x in active {
            let l = x.link
            if l.contains("MLO") { kinds.mlo += 1 } else if l.contains("Ethernet") { kinds.eth += 1 } else if l.contains("Wifi 6") { kinds.w6 += 1 } else if l.contains("Wifi 5") { kinds.w5 += 1 } else { kinds.w24 += 1 }
        }
        let chart1 = p.isGeist ? p.down : p.brand, chart2 = p.isGeist ? p.up : p.logo
        let segs: [DonutView.Segment] = [.init(value: Double(kinds.mlo), color: chart1, label: "Wi-Fi 7"), .init(value: Double(kinds.w6), color: p.chart3, label: "6 GHz"),
                                         .init(value: Double(kinds.w5), color: chart2, label: "5 GHz"), .init(value: Double(kinds.w24), color: p.chart4, label: "2,4 GHz"),
                                         .init(value: Double(kinds.eth), color: p.chart5, label: "Ethernet")]
        let top = active.sorted { $0.rate > $1.rate }.prefix(4)
        return Card("Appareils", icon: "devices", action: { CardLink(label: "Tout voir") { nav.go(.appareils) } }) {
            HStack(spacing: 18) {
                DonutView(segments: segs, size: 112, thickness: 12, label: "\(active.count)", sub: "connectés")
                LegendView(items: segs.filter { $0.value > 0 }.map { .init(color: $0.color, label: $0.label, value: "\(Int($0.value))") }, vertical: true)
            }
            .padding(.bottom, 10)
            VStack(spacing: 0) {
                ForEach(Array(top.enumerated()), id: \.element.id) { i, x in
                    Row(first: i == 0, minHeight: 50, spacing: 10, verticalPadding: 8, action: { nav.device = x }) {
                        Avatar(icon: x.kindIcon, size: .sm)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(store.name(of: x)).ui(14.5, .medium).lineLimit(1)
                            Text(x.ip).ui(13).monospacedDigit().foregroundStyle(p.mutedForeground).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Chip(Fmt.band(x.link, x.band))
                        if x.isEthernet { LucideIcon("ethernet", size: 16).foregroundStyle(p.mutedForeground) } else { SignalBars(bars: Host.signal(x.rssi).bars) }
                    }
                }
            }
            .padding(.horizontal, -16)
            .padding(.bottom, -16)
        }
    }
}

private struct HealthCard: View {
    var store: PanelStore
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p

    var body: some View {
        let cpu = store.cpuUsage, temp = store.temperature, mem = store.memPercent
        let cpu24 = store.graphs["cpu"].array.suffix(96).compactMap { $0[1].double }
        let chart1 = p.isGeist ? p.down : p.brand, chart2 = p.isGeist ? p.up : p.logo
        Card("Santé de la Bbox", icon: "box", action: { CardLink(label: "Détails") { nav.go(.plus); nav.plusPath = ["bbox"] } }) {
            HStack {
                gauge("Processeur", GaugeView(value: cpu, size: 76, color: chart1, label: "\(Int(cpu.rounded())) %"))
                Spacer(minLength: 8)
                gauge("Température", GaugeView(value: temp, max: 90, size: 76, color: temp > 72 ? p.warn : p.chart4, label: "\(Int(temp.rounded()))°"))
                Spacer(minLength: 8)
                gauge("Mémoire", GaugeView(value: mem, size: 76, color: chart2, label: "\(Int(mem.rounded())) %"))
            }
            .padding(.horizontal, 8)
            .padding(.top, 2).padding(.bottom, 14)
            KV([kv("Sessions IP", "\(store.raw["sessions"]?["currentip"].int ?? 0)"),
                kv("Requêtes DNS", Fmt.number(store.raw["dns"]?["dns"]["nbqueries"].double ?? 0)),
                kv("Démarrages", store.dev["numberofboots"].string)])
            HStack {
                Text("Charge processeur · 24 h").lineLimit(1)
                Spacer()
                Text("moy. \(Int(cpu24.isEmpty ? 0 : (cpu24.reduce(0, +) / Double(cpu24.count)).rounded())) %").monospacedDigit()
            }
            .ui(13).foregroundStyle(p.mutedForeground)
            .padding(.top, 14).padding(.bottom, 6)
            HistoryChart(values: cpu24, color: chart1, bars: true, height: 46)
        }
    }

    private func gauge(_ label: String, _ g: GaugeView) -> some View {
        VStack(spacing: 6) { g; Text(label).ui(13).foregroundStyle(p.mutedForeground) }
    }
}

private struct FiberCard: View {
    var store: PanelStore
    @Environment(\.palette) private var p

    var body: some View {
        let sff = store.raw["sff"]?["wan"] ?? .null
        let rx = sff["receive_power"].double.map { $0 / 1000 }
        let pon = "\(sff["pon_mode"]["type"].string ?? "") \(sff["pon_mode"]["moduleclass"].string ?? "")".trimmingCharacters(in: .whitespaces)
        let wan = store.wan
        Card("Fibre optique", icon: "fiber", action: { if !pon.isEmpty { Chip(pon) } }) {
            KV([kv("Signal reçu", rx.map { "\(Fmt.number($0, digits: 1)) dBm" }),
                kv("Qualité") {
                    if let rx { Text(rx > -24 && rx < -8 ? "Bonne" : "À surveiller").foregroundStyle(rx > -24 && rx < -8 ? p.ok : p.warn) } else { Text("—") }
                },
                kv("IPv4") { Text(wan["ip"]["address"].string ?? "—").font(.custom("GeistMono-Regular", size: 13)) },
                kv("Préfixe IPv6") { Text(wan["ip"]["ip6prefix"][0]["prefix"].string ?? "—").font(.custom("GeistMono-Regular", size: 13)).lineLimit(1).minimumScaleFactor(0.7) }])
            Note("Température de la Bbox · 24 h").padding(.top, 14).padding(.bottom, 4)
            HistoryChart(values: store.graphs["temp"].array.suffix(96).compactMap { $0[1].double.map { $0 / 1000 } }, color: p.chart4, height: 60)
        }
    }
}

/// Bouton d'action rapide épinglée.
private struct ActionButton: View {
    var store: PanelStore
    var action: QuickAction
    @Environment(Appearance.self) private var appearance
    @Environment(\.palette) private var p
    var body: some View {
        Btn(action.label, kind: .soft, size: .sm, icon: action.icon) { await action.run(store, appearance, dark: p.dark) }
    }
}

/// Rangée qui passe à la ligne (`flex-wrap`).
struct FlowRow: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, maxX: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { y += line + spacing; x = 0; line = 0 }
            x += size.width + spacing; line = max(line, size.height); maxX = max(maxX, x - spacing)
        }
        return CGSize(width: proposal.width ?? maxX, height: y + line)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { y += line + spacing; x = bounds.minX; line = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing; line = max(line, size.height)
        }
    }
}

// MARK: - Noir Geist

private struct HomeLigne: View {
    var store: PanelStore
    var week: [JSON]
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p
    @AppStorage("home.chart") private var chart = "wan"
    @AppStorage("lat.target") private var target = "internet"
    @State private var sheet: HomeClair.SheetKind?

    var body: some View {
        let d = HomeData(store: store), dev = store.dev, wan = store.wan
        let pon = store.raw["sff"]?["wan"]["pon_mode"]["type"].string ?? ""
        // en-tête : titre d'état et ligne d'informations
        VStack(alignment: .leading, spacing: 6) {
            Text(d.title).ui(22, .semibold, tracking: -0.02)
            FlowRow(spacing: 8) {
                HStack(spacing: 6) {
                    LiveDot(bad: !store.internetOK)
                    Text(store.internetOK ? "Internet en ligne" : "Internet coupé")
                }
                .foregroundStyle(store.internetOK ? p.foreground : p.danger)
                Text("·").foregroundStyle(p.faint)
                Text((dev["modelname"].string ?? "Bbox") + (pon.isEmpty ? "" : " · fibre \(pon)"))
                if let ip = wan["ip"]["address"].string {
                    Text("·").foregroundStyle(p.faint)
                    Text("IP \(ip)").monospacedDigit()
                }
                Text("·").foregroundStyle(p.faint)
                Text("allumée depuis \(Fmt.duration(dev["uptime"].int ?? 0))")
            }
            .ui(13).foregroundStyle(p.mutedForeground)
        }
        .padding(.bottom, 24)

        if d.alerts > 0 {
            Banner(tone: .warn, icon: "alert", text: Text("\(d.alerts) alerte\(d.alerts > 1 ? "s" : "")").bold() + Text(" signalée\(d.alerts > 1 ? "s" : "") par la Bbox."))
                .padding(.bottom, 32)
        }

        // ligne de chiffres : 2 colonnes sur iPhone
        let (dv, du) = split(Fmt.kbps(store.down)), (uv, uu) = split(Fmt.kbps(store.up)), (tv, tu) = split(Fmt.bytes(d.todayTotal))
        let latMed = Services.median(store.points("latency").filter { $0.t >= (store.points("latency").last?.t ?? 0) - 60000 }.compactMap(\.v))
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 24), GridItem(.flexible(), spacing: 24)], alignment: .leading, spacing: 20) {
            LStat(label: "Réception", value: dv, unit: du, delta: store.contractDown > 0 ? "contrat \(Fmt.kbps(store.contractDown))" : "en direct")
            LStat(label: "Envoi", value: uv, unit: uu, delta: store.contractUp > 0 ? "contrat \(Fmt.kbps(store.contractUp))" : "en direct")
            LStat(label: "Latence", value: store.latency.map(d.latFmt) ?? "—", unit: "ms",
                  delta: store.loss > 0 ? "\(Int(store.loss)) % de perte" : latMed.map { "médiane 1 min : \(d.latFmt($0)) ms" }, bad: store.loss > 0)
            LStat(label: "Appareils", value: "\(d.active.count)", unit: "/ \(store.hosts.count)",
                  delta: "\(d.active.filter { !$0.isEthernet }.count) Wi-Fi · \(d.active.filter(\.isEthernet).count) Ethernet" + (d.guestsOn > 0 ? " · \(d.guestsOn) invité\(d.guestsOn > 1 ? "s" : "")" : ""))
            LStat(label: "Aujourd’hui", value: tv, unit: tu, delta: todayDelta(d) ?? "↓ \(Fmt.bytes(d.todayRx)) · ↑ \(Fmt.bytes(d.todayTx))")
        }

        // trafic ou latence
        let info = store.targetInfo(target)
        let st = Services.stats(store.seriesOf(info.id), every: info.every)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 20) {
                Text(chart == "wan" ? "Trafic Internet" : "Latence").ui(13, .semibold)
                Spacer(minLength: 0)
                Seg(options: [.init(value: "wan", label: "Débit"), .init(value: "lat", label: "Latence")], value: $chart, small: true, block: true).fixedSize()
            }
            if chart == "wan" {
                HStack(spacing: 20) {
                    legend(p.down, "Réception", dv)
                    legend(p.up, "Envoi", uv)
                }
                LiveChart(series: [.init(data: store.points("down"), color: p.down), .init(data: store.points("up"), color: p.up)],
                          windowMs: 600_000, height: 190, format: Fmt.kbps, lag: 800, strokeWidth: 1.5)
            } else {
                HStack(spacing: 8) {
                    TargetPicker(store: store).padding(.leading, -8)
                    if !st.stale, case .some(.some(let v)) = st.last { Text("\(Services.ms(v)) ms").ui(13, .medium).monospacedDigit() }
                }
                LatencyChart(store: store, height: 190)
            }
        }
        .padding(.top, 40)
        .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.3), value: chart)

        // services
        VStack(alignment: .leading, spacing: 0) {
            LHead(title: "Latence des services", count: store.probes.isEmpty ? nil : "\(store.probes.count)")
            if let sum = store.servicesSummary { Text(sum).ui(12.5).monospacedDigit().foregroundStyle(p.faint).lineLimit(1).padding(.top, 2).padding(.bottom, 10) }
            ServicesGrid(store: store).padding(.top, store.servicesSummary == nil ? 8 : 0)
        }
        .padding(.top, 32)

        VStack(alignment: .leading, spacing: 40) {
            devices(d)
            recent(d)
            favorites(d)
            wifi(d)
            health()
        }
        .padding(.top, 40)
        .sheet(item: $sheet) { s in
            Group {
                switch s {
                case .favorites: FavoritesSheet(store: store)
                case .guest: GuestSheet(store: store)
                case .pause(let h): PauseSheet(store: store, host: h)
                }
            }
            .kitSheet()
        }
    }

    private func split(_ s: String) -> (String, String) {
        guard let r = s.range(of: "\u{202F}", options: .backwards) else { return (s, "") }
        return (String(s[..<r.lowerBound]), String(s[r.upperBound...]))
    }

    /// « +12 % vs hier à cette heure » (estimation au prorata, seulement si hier est connu).
    private func todayDelta(_ d: HomeData) -> String? {
        guard week.count >= 2 else { return nil }
        let y = week[week.count - 2]
        guard y["has"] == .bool(true) || y["has"].isOn else { return nil }
        let yTotal = (y["rx"].double ?? 0) + (y["tx"].double ?? 0)
        let c = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let hour = Double(c.hour ?? 0) + Double(c.minute ?? 0) / 60
        guard yTotal > 0, hour > 1 else { return nil }
        let delta = Int(((d.todayTotal / (yTotal * (hour / 24))) - 1) * 100)
        return "\(delta > 0 ? "+" : delta < 0 ? "−" : "")\(abs(delta)) % vs hier à cette heure"
    }

    private func legend(_ color: Color, _ label: String, _ value: String) -> some View {
        HStack(spacing: 6) {
            Capsule().fill(color).frame(width: 12, height: 2)
            Text(label).foregroundStyle(p.mutedForeground)
            Text(value).fontWeight(.medium).monospacedDigit()
        }
        .ui(13)
    }

    private func dot(_ h: Host) -> Color {
        store.pauseTimer(for: h) != nil ? p.warn : h.active ? p.ok : p.faint.opacity(0.5)
    }

    private func devices(_ d: HomeData) -> some View {
        let list = store.hosts.sorted {
            if $0.active != $1.active { return $0.active }
            if $0.rate != $1.rate { return $0.rate > $1.rate }
            return store.name(of: $0).localizedCompare(store.name(of: $1)) == .orderedAscending
        }.prefix(12)
        return VStack(alignment: .leading, spacing: 8) {
            LHead(title: "Appareils", count: "\(d.active.count)/\(store.hosts.count)", link: "Tout voir") { nav.go(.appareils) }
            VStack(spacing: 0) {
                ForEach(list) { h in
                    let pz = store.pauseTimer(for: h)
                    Button { nav.device = h } label: {
                        HStack(spacing: 12) {
                            Circle().fill(dot(h)).frame(width: 6, height: 6)
                            LucideIcon(h.kindIcon, size: 16).foregroundStyle(p.mutedForeground)
                            Text(store.name(of: h)).foregroundStyle(h.active ? p.foreground : p.mutedForeground).lineLimit(1)
                            Spacer(minLength: 4)
                            Text(pz.map { "pause · \(Fmt.until($0.until))" } ?? (h.active ? Fmt.band(h.link, h.band) : "hors ligne"))
                                .ui(12.5).foregroundStyle(p.mutedForeground).lineLimit(1)
                            Group {
                                if h.active { if h.isEthernet { LucideIcon("ethernet", size: 14).foregroundStyle(p.faint) } else { SignalBars(bars: Host.signal(h.rssi).bars) } }
                            }
                            .frame(width: 20)
                        }
                        .ui(13.5)
                        .padding(.horizontal, 8)
                        .frame(height: 48)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                }
            }
            .padding(.horizontal, -8)
        }
    }

    private func recent(_ d: HomeData) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LHead(title: "Activité", count: store.unread > 0 ? "\(store.unread) non lu\(store.unread > 1 ? "s" : "")" : nil, link: "Tout voir") { nav.go(.activite) }
            if d.recent.isEmpty {
                EmptyState(icon: "bell", title: "Pas encore d’activité", text: "Arrivées, départs, coupures et alertes s’afficheront ici en direct.")
            } else {
                ForEach(d.recent) { e in
                    let i = e.info { mac in store.host(mac: mac).map(store.name(of:)) }
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Circle().fill(toneColor(i.tone)).frame(width: 6, height: 6).alignmentGuide(.firstTextBaseline) { $0.height + 2 }
                        (Text(i.title) + Text(i.sub.map { " · " + $0 } ?? "").foregroundColor(p.mutedForeground))
                            .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                        Text(Fmt.ago(e.t).replacingOccurrences(of: "il y a ", with: "")).ui(12).monospacedDigit().foregroundStyle(p.faint)
                    }
                    .ui(13)
                }
            }
        }
    }

    private func toneColor(_ t: Tone) -> Color {
        switch t { case .ok: p.ok; case .warn: p.warn; case .danger: p.danger; default: p.faint.opacity(0.6) }
    }

    private func favorites(_ d: HomeData) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LHead(title: "Favoris", link: "Modifier", chevron: false) { sheet = .favorites }
            if d.favDevices.isEmpty && d.favActions.isEmpty {
                Text("Épinglez des appareils à mettre en pause d’un geste, le Wi-Fi invité ou la carte Wi-Fi.").ui(13).foregroundStyle(p.mutedForeground)
            } else {
                VStack(spacing: 0) {
                    ForEach(d.favDevices) { h in
                        let pz = store.pauseTimer(for: h)
                        HStack(spacing: 12) {
                            Circle().fill(dot(h)).frame(width: 6, height: 6)
                            Button(store.name(of: h)) { nav.device = h }.buttonStyle(.plain).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                            if pz != nil {
                                Btn("Reprendre", kind: .soft, size: .xs, icon: "play") { await store.resume(h) }
                            } else {
                                Btn("Pause", kind: .soft, size: .xs, icon: "pause") { sheet = .pause(h) }
                            }
                        }
                        .ui(13.5)
                        .padding(.horizontal, 8)
                        .frame(height: 48)
                    }
                }
                .padding(.horizontal, -8)
                if !d.favActions.isEmpty {
                    FlowRow(spacing: 6) { ForEach(d.favActions) { a in ActionButton(store: store, action: a) } }.padding(.top, 4)
                }
            }
        }
    }

    private func wifi(_ d: HomeData) -> some View {
        let w = store.w, per = d.perBand
        var rows: [(String, String)] = [("Réseau", w["ssid"]["24"]["id"].string ?? "…")]
        for (k, l) in d.bands { rows.append((l, "\(Fmt.plural(per[k] ?? 0, "appareil")) · \(Fmt.kbps(d.bandRate(k)))")) }
        if !w["ssid"]["mlo"].isNull { rows.append(("Wi-Fi 7", Fmt.plural(per["mlo"] ?? 0, "appareil"))) }
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                LHead(title: "Wi-Fi", link: "Gérer") { nav.go(.wifi) }
                LiveToggle(value: store.wifiOn, label: "Wi-Fi", confirm: wifiConfirm) { await store.setWifi($0) }
            }
            DL(rows: rows)
            Button { sheet = .guest } label: {
                HStack(spacing: 12) {
                    LucideIcon("link", size: 16).foregroundStyle(p.mutedForeground)
                    Text("Wi-Fi invité").frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 6) {
                        if store.guestOn { Circle().fill(p.ok).frame(width: 6, height: 6) }
                        Text(store.guestOn ? (store.guestTimer.map { "jusqu’à \(Fmt.until($0.until))" } ?? "actif") : "désactivé")
                    }
                    .ui(12.5).foregroundStyle(store.guestOn ? p.ok : p.mutedForeground)
                    LucideIcon("chevron", size: 14).foregroundStyle(p.faint)
                }
                .ui(13)
                .padding(.horizontal, 8).frame(height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
            .padding(.horizontal, -8)
        }
    }

    private func health() -> some View {
        let rx = store.raw["sff"]?["wan"]["receive_power"].double.map { $0 / 1000 }
        let temp = store.temperature
        let rows: [(String, AnyView)] = [
            ("Processeur", AnyView(meterRow("\(Int(store.cpuUsage.rounded())) %", store.cpuUsage, p.down))),
            ("Température", AnyView(meterRow("\(Int(temp.rounded())) °C", temp / 90 * 100, temp > 72 ? p.warn : p.chart4))),
            ("Mémoire", AnyView(meterRow("\(Int(store.memPercent.rounded())) %", store.memPercent, p.up))),
            ("Signal fibre", AnyView(Text(rx.map { "\(Fmt.number($0, digits: 1)) dBm" } ?? "—").monospacedDigit()
                .foregroundStyle(rx.map { $0 > -24 && $0 < -8 } ?? true ? p.foreground : p.warn))),
            ("Firmware", AnyView(Text(store.dev["main"]["version"].string ?? "—").monospacedDigit())),
            ("Allumée depuis", AnyView(Text(Fmt.duration(store.dev["uptime"].int ?? 0)))),
        ]
        return VStack(alignment: .leading, spacing: 10) {
            LHead(title: "Ma Bbox", link: "Détails") { nav.go(.plus); nav.plusPath = ["bbox"] }
            DL(views: rows)
        }
    }

    private func meterRow(_ text: String, _ v: Double, _ color: Color) -> some View {
        HStack(spacing: 8) {
            Text(text).monospacedDigit()
            Capsule().fill(p.selected).frame(width: 56, height: 4)
                .overlay(alignment: .leading) {
                    GeometryReader { g in Capsule().fill(color).frame(width: g.size.width * max(0.02, min(1, v / 100))) }
                }
                .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.8), value: v)
        }
    }
}

/// Valeur de la ligne de chiffres (Noir Geist).
private struct LStat: View {
    var label: String
    var value: String
    var unit: String?
    var delta: String?
    var bad = false
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).ui(12.5).foregroundStyle(p.mutedForeground)
            (Text(value) + Text(unit.map { " " + $0 } ?? "").font(p.font(size: 14)).foregroundColor(p.mutedForeground))
                .ui(24, .medium, tracking: -0.025).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .contentTransition(.numericText())
                .padding(.top, 4)
            if let delta { Text(delta).ui(12).foregroundStyle(bad ? p.danger : p.faint).lineLimit(1).padding(.top, 2) }
        }
        .animation(.easeOut(duration: 0.4), value: value)
    }
}

/// En-tête de section Noir Geist : titre, compteur, lien à droite.
private struct LHead: View {
    var title: String
    var count: String?
    var link: String?
    var chevron = true
    var action: (() -> Void)?
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: 8) {
            Text(title).fontWeight(.semibold)
            if let count { Text(count).monospacedDigit().foregroundStyle(p.faint) }
            Spacer(minLength: 0)
            if let link, let action {
                Button(action: action) {
                    HStack(spacing: 2) {
                        Text(link)
                        if chevron { LucideIcon("chevron", size: 14) }
                    }
                    .ui(12.5).foregroundStyle(p.mutedForeground)
                    .padding(.vertical, 12).padding(.horizontal, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .padding(.vertical, -12)
            }
        }
        .ui(13)
        .frame(minHeight: 28)
    }
}

/// Liste de définitions Noir Geist (`dl` en deux colonnes, 40 % / 60 %).
struct DL: View {
    var views: [(String, AnyView)]
    @Environment(\.palette) private var p

    init(rows: [(String, String)]) { views = rows.map { ($0.0, AnyView(Text($0.1).lineLimit(1))) } }
    init(views: [(String, AnyView)]) { self.views = views }

    var body: some View {
        GeometryReader { g in
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(views.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: 0) {
                        Text(row.0).foregroundStyle(p.mutedForeground).frame(width: max(96, g.size.width * 0.4), alignment: .leading)
                        row.1.frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .frame(height: CGFloat(views.count) * 16 + CGFloat(max(0, views.count - 1)) * 8)
        .ui(13)
    }
}
