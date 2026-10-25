import SwiftUI

/// Activité (`views/activity.tsx`) : présence 24 h, alertes et journal unifié, groupé par jour.
struct ActivityScreen: View {
    var store: PanelStore
    @State private var tab = "all"
    @State private var older: [PanelEvent] = []
    @State private var more = true
    @State private var presence: [PanelEvent]?
    @State private var presenceFailed = false
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p

    private static let noise: Set<String> = ["wifi_restart", "port_up", "port_down"]
    private static let day = 86_400_000.0

    private typealias Item = (e: PanelEvent, i: (icon: String, tone: Tone, title: String, sub: String?, cat: String))

    var body: some View {
        let items = allItems
        let counts = (alerts: items.filter { $0.i.cat == "alert" || $0.e.level != "info" }.count, presence: items.filter { $0.i.cat == "presence" }.count)
        let groups = grouped(items.filter(keep))
        Page(title: "Activité", refresh: { await loadPresence() }) {
            PageHead(kicker: "Vue d’ensemble", title: "Activité",
                     sub: store.unread > 0 ? "\(store.unread) notification\(store.unread > 1 ? "s" : "") non lue\(store.unread > 1 ? "s" : "")" : "Tout est lu")
            if store.unread > 0 {
                Btn("Tout marquer comme lu", kind: .soft, size: .sm, icon: "check") { await store.ackEvents() }
                    .padding(.top, -8).padding(.bottom, 16)
            }
            if !store.isRelay {
                Card { UnavailableNote(reason: .relay, detail: "Le relais tient le journal (arrivées, départs, coupures) et l’historique de présence.") }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Card("Présence sur 24 heures", icon: "user") { PresenceCard(store: store, data: presence, failed: presenceFailed) }
                    VStack(alignment: .leading, spacing: 0) {
                        PageTabs(tabs: [.init(value: "all", label: "Tout"), .init(value: "alerts", label: "Alertes", count: counts.alerts > 0 ? counts.alerts : nil),
                                        .init(value: "presence", label: "Présence", count: counts.presence > 0 ? counts.presence : nil), .init(value: "system", label: "Système")],
                                 value: $tab)
                        if groups.isEmpty {
                            EmptyState(icon: "bell", title: "Rien à afficher", text: "Aucun événement dans cette catégorie pour le moment.").cardSurface()
                        } else {
                            ForEach(Array(groups.enumerated()), id: \.element.day) { gi, g in
                                SectionTitle(g.day, first: gi == 0)
                                Card(flush: true) {
                                    ForEach(Array(g.items.enumerated()), id: \.element.e.id) { k, it in
                                        let h = it.e.json["mac"].string.flatMap(store.host(mac:))
                                        EventItem(event: it.e, info: it.i, first: k == 0, action: h.map { h in { nav.device = h } })
                                    }
                                }
                            }
                            if more {
                                Btn("Afficher les événements plus anciens", kind: .ghost, size: .sm, icon: "clock") { await loadMore(before: items.last?.e.t) }
                                    .frame(maxWidth: .infinity).padding(.top, 20)
                            }
                        }
                    }
                }
            }
        }
        .task(id: store.isRelay) {
            // la frise est relue chaque minute, comme le `poll: 60000` du web
            while !Task.isCancelled && store.isRelay {
                await loadPresence()
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }

    private var allItems: [Item] {
        var seen = Set<String>(), out: [PanelEvent] = []
        for e in store.events + older where !seen.contains(e.id) { seen.insert(e.id); out.append(e) }
        return out.filter { !Self.noise.contains($0.type) }.sorted { $0.t > $1.t }
            .map { e in (e, e.info { mac in store.host(mac: mac).map(store.name(of:)) }) }
    }

    private func keep(_ it: Item) -> Bool {
        switch tab {
        case "alerts": it.i.cat == "alert" || it.e.level != "info"
        case "presence": it.i.cat == "presence"
        case "system": it.i.cat == "system" || it.i.cat == "action"
        default: true
        }
    }

    private func grouped(_ items: [Item]) -> [(day: String, items: [Item])] {
        var out: [(day: String, items: [Item])] = []
        for it in items {
            let d = Fmt.day(it.e.t)
            if out.last?.day == d { out[out.count - 1].items.append(it) } else { out.append((d, [it])) }
        }
        return out
    }

    private func loadPresence() async {
        guard let relay = store.relay else { return }
        let since = Int(Date().timeIntervalSince1970 * 1000 - Self.day)
        if let r = try? await relay.panel(.get, "/panel/events?since=\(since)&types=arrive,leave&limit=2000") {
            presence = r["events"].array.map(PanelEvent.init)
            presenceFailed = false
        } else {
            // comme le web : sans réponse, pas de frise (et non une frise déduite des seuls appareils connectés)
            presenceFailed = presence == nil
        }
    }

    private func loadMore(before: Double?) async {
        guard let relay = store.relay else { return }
        let b = Int(before ?? Date().timeIntervalSince1970 * 1000)
        guard let r = try? await relay.panel(.get, "/panel/events?before=\(b)&limit=200"), !r["events"].array.isEmpty else { more = false; return }
        older += r["events"].array.map(PanelEvent.init)
    }
}

/// Ligne du journal (`EventItem`) : heure, pastille, titre et détail, point « non lu ».
private struct EventItem: View {
    var event: PanelEvent
    var info: (icon: String, tone: Tone, title: String, sub: String?, cat: String)
    var first: Bool
    var action: (() -> Void)?
    @Environment(\.palette) private var p

    var body: some View {
        Row(first: first, spacing: 10, action: action) {
            Text(Fmt.time(event.date)).ui(13).monospacedDigit().foregroundStyle(p.mutedForeground).frame(width: 40, alignment: .leading)
            Avatar(icon: info.icon, size: .sm, tone: info.tone)
            VStack(alignment: .leading, spacing: 0) {
                Text(info.title).ui(14, .medium).lineLimit(1)
                if let sub = info.sub { Text(sub).ui(13).foregroundStyle(p.mutedForeground).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !event.ack { Circle().fill(p.warn).frame(width: 8, height: 8).accessibilityLabel("Non lu") }
        }
    }
}

/// Frise de présence (`Presence`) : segments reconstitués à partir des arrivées et départs.
private struct PresenceCard: View {
    var store: PanelStore
    var data: [PanelEvent]?
    var failed = false
    @Environment(\.palette) private var p

    var body: some View {
        let to = Date().timeIntervalSince1970 * 1000, from = to - 86_400_000
        let rows = data.map { build($0, from: from, to: to) } ?? []
        if data == nil && !failed {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in RoundedRectangle(cornerRadius: 6).fill(p.muted).frame(height: 18) } }
        } else if rows.isEmpty {
            EmptyState(icon: "user", title: "Pas encore de données de présence", text: "Les connexions et déconnexions des appareils s’afficheront ici au fil de la journée.")
        } else {
            PresenceTimeline(rows: rows, from: from, to: to)
            Note("D’après le journal de la Bbox et le relevé en direct du serveur du panel. En vert : connecté en ce moment.").padding(.top, 12)
        }
    }

    private func dur(_ ms: Double) -> String {
        let m = Int((ms / 60000).rounded())
        return m < 60 ? "\(m) min" : "\(m / 60) h \(String(format: "%02d", m % 60))"
    }

    private func build(_ events: [PanelEvent], from: Double, to: Double) -> [PresenceTimeline.RowData] {
        var per: [String: [PanelEvent]] = [:], order: [String] = []
        for e in events.sorted(by: { $0.t < $1.t }) {
            guard let mac = e.json["mac"].string?.lowercased(), !mac.isEmpty else { continue }
            if per[mac] == nil { order.append(mac) }
            per[mac, default: []].append(e)
        }
        for h in store.hosts where h.active && per[h.mac] == nil { per[h.mac] = []; order.append(h.mac) }
        var out: [(row: PresenceTimeline.RowData, active: Bool, total: Double)] = []
        for mac in order {
            let list = per[mac] ?? [], h = store.host(mac: mac)
            var segs: [(Double, Double, Bool)] = []
            var start: Double? = list.first?.type == "leave" ? from : nil
            for e in list {
                if e.type == "arrive" { if start == nil { start = e.t } }
                else if e.type == "leave" { segs.append((start ?? from, e.t, false)); start = nil }
            }
            if h?.active == true {
                if let s = start { segs.append((s, to, true)) }
                else if list.isEmpty { segs.append((from, to, true)) }
                else { segs.append((max(list.last!.t, to - 60000), to, true)) }
            } else if let s = start { segs.append((s, to, false)) }
            let total = segs.reduce(0) { $0 + ($1.1 - $1.0) }
            guard total > 0 else { continue }
            let name = h.map(store.name(of:)) ?? list.compactMap(\.name).first ?? mac
            out.append((.init(id: mac, icon: h?.kindIcon ?? "monitor-smartphone", name: name, segs: segs, label: dur(total)), h?.active == true, total))
        }
        return out.sorted { ($0.active ? 1 : 0, $0.total) > ($1.active ? 1 : 0, $1.total) }.prefix(14).map(\.row)
    }
}
