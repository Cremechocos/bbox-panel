import SwiftUI

// Latence par service (YouTube, Netflix…), repris de `web/src/lib/services.ts` et `components/services.tsx`.
// La mesure est faite par le relais (séries `p:<id>`) ; l'app ne fait que l'afficher.

struct Probe: Identifiable, Equatable {
    var id: String
    var name: String
    var host: String
    var port: Int
    var ip: String?

    init(json: JSON) {
        id = json["id"].string ?? ""
        name = json["name"].string ?? id
        host = json["host"].string ?? ""
        port = json["port"].int ?? 443
        ip = json["ip"].string
    }
}

struct ProbeStats {
    var last: Double??   // nil = pas de mesure, .some(nil) = perdue
    var med: Double?
    var jitter: Double
    var loss: Int
    var stale: Bool
}

enum Services {
    /// Couleurs de marque (`BRANDS`) ; logos Simple Icons dans `Brands/brand-<id>`.
    static let colors: [String: UInt32] = [
        "bouygues": 0x00a5dc, "cloudflare": 0xF38020, "google-dns": 0x4285F4, "quad9": 0xDC205E, "google": 0x4285F4, "amazon": 0xFF9900,
        "apple": 0x000000, "microsoft": 0x00A4EF, "wikipedia": 0x000000, "youtube": 0xFF0000, "netflix": 0xE50914, "twitch": 0x9146FF,
        "spotify": 0x1ED760, "deezer": 0xA238FF, "facebook": 0x0866FF, "instagram": 0xFF0069, "whatsapp": 0x25D366, "tiktok": 0x000000,
        "x": 0x000000, "reddit": 0xFF4500, "discord": 0x5865F2, "steam": 0x000000, "playstation": 0x0070D1, "riot": 0xEB0029,
        "epic": 0x313131, "chatgpt": 0x10A37F, "claude": 0xD97757, "github": 0x181717, "zoom": 0x0B5CFF,
    ]
    static let glyphs: Set<String> = ["cloudflare", "google-dns", "quad9", "google", "apple", "wikipedia", "youtube", "netflix", "twitch", "spotify",
                                      "deezer", "facebook", "instagram", "whatsapp", "tiktok", "x", "reddit", "discord", "steam", "playstation",
                                      "riot", "epic", "claude", "github"]
    static let hues: [UInt32] = [0x3b82f6, 0x8b5cf6, 0xec4899, 0xf59e0b, 0x10b981, 0x06b6d4, 0xef4444, 0x84cc16]

    /// Couleur affichée : une marque noire ou presque prend la couleur du texte.
    static func color(_ id: String, _ name: String, _ p: Palette) -> Color {
        if let hex = colors[id] {
            let r = Double((hex >> 16) & 255), g = Double((hex >> 8) & 255), b = Double(hex & 255)
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.22 ? p.foreground : Color(hex: hex)
        }
        var h: Int32 = 7
        for c in (id + name).utf16 { h = h &* 31 &+ Int32(c) }
        return Color(hex: hues[Int(abs(Int(h))) % hues.count])
    }

    static func median(_ a: [Double]) -> Double? {
        guard !a.isEmpty else { return nil }
        let s = a.sorted(), m = s.count / 2
        return s.count % 2 == 1 ? s[m] : (s[m - 1] + s[m]) / 2
    }

    static func stats(_ pts: [Pt], every: Double = 5000) -> ProbeStats {
        guard let lastPt = pts.last else { return ProbeStats(last: nil, med: nil, jitter: 0, loss: 0, stale: true) }
        let now = Date().timeIntervalSince1970 * 1000
        let stale = now - lastPt.t > max(every * 3, 12000)
        let minute = pts.filter { $0.t >= lastPt.t - 60000 }.compactMap(\.v)
        let recent = pts.suffix(30)
        let vals = recent.compactMap(\.v)
        var j = 0.0
        for i in vals.indices.dropFirst() { j += abs(vals[i] - vals[i - 1]) }
        return ProbeStats(last: .some(lastPt.v), med: median(minute), jitter: vals.count > 1 ? j / Double(vals.count - 1) : 0,
                          loss: Int((Double(recent.filter { $0.v == nil }.count) / Double(recent.count) * 100).rounded()), stale: stale)
    }

    static func ms(_ v: Double) -> String { v < 10 ? String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",") : String(Int(v.rounded())) }
    static func every(_ ms: Double) -> String { ms >= 60000 ? "chaque minute" : "toutes les \(Int((ms / 1000).rounded())) s" }

    enum Quality { case good, fair, slow, lost, none }
    static func quality(_ s: ProbeStats) -> Quality {
        guard !s.stale, let last = s.last else { return .none }
        guard let v = last else { return .lost }
        return v <= 30 ? .good : v <= 80 ? .fair : .slow
    }
    static func qualityColor(_ q: Quality, _ p: Palette) -> Color {
        switch q { case .good: p.ok; case .fair: p.warn; case .slow, .lost: p.danger; case .none: p.faint }
    }
}

extension PanelStore {
    var probes: [Probe] { (raw["probes"] ?? .null)["list"].array.map(Probe.init) }
    var probeEvery: Double { (raw["probes"] ?? .null)["every"].double ?? 5000 }
    var fromBbox: Bool { (raw["probes"] ?? .null)["fromBbox"] != .bool(false) }

    func seriesOf(_ id: String) -> [Pt] { id == "internet" ? points("latency") : points("p:" + id) }

    /// Cible du graphique de latence (`targetInfo`) : « internet » = meilleure de 1.1.1.1 et 8.8.8.8.
    func targetInfo(_ id: String) -> (id: String, name: String, host: String, every: Double) {
        guard id != "internet", let p = probes.first(where: { $0.id == id }) else {
            return ("internet", "Internet", "1.1.1.1 et 8.8.8.8, meilleure des deux", 2000)
        }
        let shared = id == "cloudflare" || id == "google-dns"
        let host = p.host + (p.ip.map { $0 != p.host ? " · " + $0 : "" } ?? "") + (p.port != 443 ? " (port \(p.port))" : "")
        return (id, p.name, host, shared ? 2000 : probeEvery)
    }

    /// Résumé d'une ligne (`servicesSummary`).
    var servicesSummary: String? {
        let vals = probes.compactMap { p in Services.stats(seriesOf(p.id)).med.map { (p, $0) } }.sorted { $0.1 < $1.1 }
        guard vals.count >= 2, let med = Services.median(vals.map(\.1)) else { return nil }
        let lanPts = points("lan"), t = lanPts.last?.t ?? 0
        let lan = Services.median(lanPts.filter { $0.t >= t - 60000 }.compactMap(\.v))
        let hop = lan.flatMap { $0 >= 1 ? (fromBbox ? "depuis la Bbox (\(Services.ms($0)) ms de trajet local retirés)" : "dont ≈ \(Services.ms($0)) ms jusqu’à la Bbox") : nil }
        return ["médiane \(Services.ms(med)) ms", hop, "le plus rapide : \(vals[0].0.name)", "le plus lent : \(vals[vals.count - 1].0.name)"]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

/// Logo d'un service en couleur de marque ; `tile` : pastille teintée (1,75 × la taille du logo).
struct ServiceIcon: View {
    var id: String
    var name: String
    var size: CGFloat = 16
    var tile = false
    @Environment(\.palette) private var p

    var body: some View {
        let color = Services.color(id, name, p)
        let glyph = glyphView(color).frame(width: size, height: size)
        if tile {
            glyph.frame(width: size * 1.75, height: size * 1.75)
                .background(color.opacity(0.13), in: RoundedRectangle(cornerRadius: size * 1.75 * (p.isGeist ? 0.26 : 0.3), style: .continuous))
        } else {
            glyph
        }
    }

    @ViewBuilder private func glyphView(_ color: Color) -> some View {
        if Services.glyphs.contains(id) {
            Image("brand-" + id).renderingMode(.template).resizable().scaledToFit().foregroundStyle(color)
        } else {
            Canvas { ctx, size in
                let s = size.width / 24
                switch id {
                case "microsoft":
                    for (x, y, hex) in [(2.0, 2.0, 0xF25022), (12.5, 2.0, 0x7FBA00), (2.0, 12.5, 0x00A4EF), (12.5, 12.5, 0xFFB900)] as [(CGFloat, CGFloat, UInt32)] {
                        ctx.fill(Path(CGRect(x: x * s, y: y * s, width: 9.5 * s, height: 9.5 * s)), with: .color(Color(hex: hex)))
                    }
                case "amazon":
                    ctx.draw(Text("a").font(.system(size: 17 * s, weight: .heavy)).foregroundColor(p.foreground), at: CGPoint(x: 12 * s, y: 10 * s))
                    var smile = Path()
                    smile.move(to: CGPoint(x: 4.5 * s, y: 17.2 * s))
                    smile.addQuadCurve(to: CGPoint(x: 19.5 * s, y: 17.2 * s), control: CGPoint(x: 12 * s, y: 21.6 * s))
                    ctx.stroke(smile, with: .color(color), style: StrokeStyle(lineWidth: 2.2 * s, lineCap: .round))
                    var arrow = Path()
                    arrow.move(to: CGPoint(x: 17.2 * s, y: 15.6 * s)); arrow.addLine(to: CGPoint(x: 19.8 * s, y: 17.1 * s)); arrow.addLine(to: CGPoint(x: 18.8 * s, y: 19.8 * s))
                    ctx.stroke(arrow, with: .color(color), style: StrokeStyle(lineWidth: 2 * s, lineCap: .round, lineJoin: .round))
                case "chatgpt":
                    for r in [0.0, 60, 120] {
                        var c = ctx
                        c.translateBy(x: 12 * s, y: 12 * s); c.rotate(by: .degrees(r))
                        c.stroke(Path(ellipseIn: CGRect(x: -9 * s, y: -4.2 * s, width: 18 * s, height: 8.4 * s)), with: .color(color), lineWidth: 1.9 * s)
                    }
                default:
                    ctx.fill(Path(roundedRect: CGRect(x: 1.5 * s, y: 1.5 * s, width: 21 * s, height: 21 * s), cornerRadius: 6 * s), with: .color(color.opacity(0.16)))
                    ctx.draw(Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()).font(.system(size: 13 * s, weight: .bold)).foregroundColor(color),
                             at: CGPoint(x: 12 * s, y: 12 * s))
                }
            }
        }
    }
}

/// Valeur en ms : « — » sans mesure, « perdu » sans réponse.
struct MsValue: View {
    var v: Double??
    var size: CGFloat
    var weight: Font.Weight
    @Environment(\.palette) private var p

    var body: some View {
        switch v {
        case .none: Text("—").ui(size, weight).foregroundStyle(p.faint)
        case .some(.none): Text("perdu").ui(size, weight).foregroundStyle(p.danger)
        case .some(.some(let x)):
            (Text(Services.ms(x)) + Text("ms").font(p.font(size: size * 0.55)).foregroundColor(p.mutedForeground))
                .ui(size, weight, tracking: -0.03).monospacedDigit().contentTransition(.numericText())
        }
    }
}

/// Tuile d'un service (`ProbeTile`).
struct ProbeTile: View {
    var probe: Probe
    var pts: [Pt]
    var every: Double
    var selected: Bool
    var onSelect: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        let st = Services.stats(pts, every: every)
        let q = Services.quality(st)
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: p.isGeist ? 8 : 10) {
                    ServiceIcon(id: probe.id, name: probe.name, size: p.isGeist ? 15 : 17, tile: !p.isGeist)
                    Text(probe.name).ui(p.isGeist ? 13 : 13.5, p.isGeist ? .regular : .semibold)
                        .foregroundStyle(p.isGeist ? p.mutedForeground : p.foreground).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Circle().fill(Services.qualityColor(q, p)).frame(width: 6, height: 6)
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    MsValue(v: st.stale ? nil : st.last, size: p.isGeist ? 21 : 24, weight: p.isGeist ? .medium : .semibold)
                    if let med = st.med, !st.stale {
                        Spacer(minLength: 0)
                        Text("méd. \(Services.ms(med))").ui(11.5).monospacedDigit().foregroundStyle(p.faint).lineLimit(1)
                    }
                }
                .padding(.top, p.isGeist ? 6 : 10)
                Sparkline(points: Array(pts.suffix(36)), color: selected ? p.lat : p.lat.opacity(0.75), strokeWidth: 1.4)
                    .frame(height: 24)
                    .padding(.top, p.isGeist ? 8 : 10)
            }
            .padding(p.isGeist ? 10 : 14)
            .background(selected ? (p.isGeist ? p.selected : p.surface) : (p.isGeist ? .clear : p.surface),
                        in: RoundedRectangle(cornerRadius: p.isGeist ? p.radius : p.radius2XL, style: .continuous))
            .overlay {
                if selected && !p.isGeist {
                    RoundedRectangle(cornerRadius: p.radius2XL, style: .continuous).strokeBorder(p.brand, lineWidth: 2)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Grille des services mesurés ; un toucher choisit le service affiché dans le graphique de latence.
struct ServicesGrid: View {
    var store: PanelStore
    @AppStorage("lat.target") private var target = "internet"
    @AppStorage("home.chart") private var chart = "lat"
    @Environment(\.palette) private var p

    var body: some View {
        let list = store.probes
        if list.isEmpty {
            Text("Aucun service mesuré.").ui(13.5).foregroundStyle(p.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(p.isGeist ? 0 : 20)
                .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radius2XL, style: .continuous).fill(p.surface) } }
        } else {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: p.isGeist ? 4 : 10), count: 2), spacing: p.isGeist ? 4 : 10) {
                ForEach(list) { probe in
                    ProbeTile(probe: probe, pts: store.seriesOf(probe.id),
                              every: probe.id == "cloudflare" || probe.id == "google-dns" ? 2000 : store.probeEvery,
                              selected: target == probe.id) {
                        target = target == probe.id ? "internet" : probe.id
                        chart = "lat"
                    }
                }
            }
            .padding(.horizontal, p.isGeist ? -10 : 0)
        }
    }
}

/// Choix du service affiché (`TargetPicker`) : menu déroulant.
struct TargetPicker: View {
    var store: PanelStore
    @AppStorage("lat.target") private var target = "internet"
    @Environment(\.palette) private var p

    var body: some View {
        let info = store.targetInfo(target)
        Menu {
            Picker("Service affiché", selection: $target) {
                Label("Internet", image: "lucide-globe").tag("internet")
                ForEach(store.probes) { pr in Text(pr.name).tag(pr.id) }
            }
        } label: {
            HStack(spacing: 8) {
                if info.id == "internet" { LucideIcon("globe", size: 15).foregroundStyle(p.lat) } else { ServiceIcon(id: info.id, name: info.name, size: 15) }
                Text(info.name).ui(p.isGeist ? 13 : 13.5, p.isGeist ? .medium : .semibold).lineLimit(1)
                LucideIcon("chevron-down", size: 14).foregroundStyle(p.mutedForeground)
            }
            .foregroundStyle(p.foreground)
            .padding(.horizontal, p.isGeist ? 8 : 10)
            .frame(height: p.isGeist ? 28 : 32)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Service affiché")
    }
}

/// Graphique de latence du service choisi (`LatencyChart`) : seuil 100 ms, pertes en rouge.
struct LatencyChart: View {
    var store: PanelStore
    var height: CGFloat
    var windowMs: Double = 300_000
    @AppStorage("lat.target") private var target = "internet"
    @Environment(\.palette) private var p

    var body: some View {
        let info = store.targetInfo(target)
        let slow = info.every > 5000
        LiveChart(series: [.init(data: store.seriesOf(info.id), color: p.lat)], windowMs: windowMs, height: height,
                  format: { "\(Int($0.rounded())) ms" }, lag: slow ? 1500 : info.every + 300, threshold: 100, loss: true, hold: slow)
            .id(info.id)
    }
}
