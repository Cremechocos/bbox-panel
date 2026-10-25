import SwiftUI

// Feuilles partagées, reprises de `web/src/components/sheets.tsx` (tiroir du bas sur iPhone).

/// Corps et pied de feuille (`SheetBody` / `SheetFooter`) : marges 20 (Bbox Clair) ou 16 (Noir Geist).
struct SheetScaffold<Content: View, Footer: View>: View {
    var title: String
    var description: String?
    @ViewBuilder var content: Content
    @ViewBuilder var footer: Footer
    @Environment(\.palette) private var p

    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: title, description: description)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) { content }
                    .padding(.horizontal, p.isGeist ? 16 : 20)
                    .padding(.bottom, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 8) { footer }
                .padding(.horizontal, p.isGeist ? 16 : 20)
                .padding(.vertical, 12)
                .overlay(alignment: .top) { Rectangle().fill(p.border).frame(height: 1) }
        }
    }
}

enum PauseChoice: Hashable { case minutes(Int), morning, custom }

/// Mettre un appareil en pause (`PauseSheet`) : 30 min, 1 h, 2 h, jusqu'à demain 7 h, ou une heure précise.
struct PauseSheet: View {
    var store: PanelStore
    var host: Host
    @State private var choice: PauseChoice = .minutes(60)
    @State private var custom = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    private var until: Date {
        switch choice {
        case .minutes(let m): return Date().addingTimeInterval(Double(m) * 60)
        case .morning:
            var d = Calendar.current.date(bySettingHour: 7, minute: 0, second: 0, of: Date())!
            if Calendar.current.component(.hour, from: Date()) >= 7 { d = Calendar.current.date(byAdding: .day, value: 1, to: d)! }
            return d
        case .custom:
            var d = Calendar.current.date(bySettingHour: Calendar.current.component(.hour, from: custom), minute: Calendar.current.component(.minute, from: custom), second: 0, of: Date())!
            if d <= Date() { d = Calendar.current.date(byAdding: .day, value: 1, to: d)! }
            return d
        }
    }

    var body: some View {
        let cur = store.pauseTimer(for: host)
        SheetScaffold(title: "Mettre en pause", description: store.name(of: host)) {
            if let cur {
                Banner(tone: .warn, icon: "pause", text: Text("En pause jusqu’à \(Fmt.until(cur.until)).").bold() + Text(" Choisissez une nouvelle durée pour prolonger ou raccourcir."))
            }
            Text("\(store.name(of: host)) n’aura plus accès à Internet (le réseau local reste disponible). La pause est levée automatiquement, même si l’app est fermée.")
                .ui(13.5).foregroundStyle(p.mutedForeground).fixedSize(horizontal: false, vertical: true)
            Choices(options: [.init(value: .minutes(30), label: "30 min"), .init(value: .minutes(60), label: "1 heure"), .init(value: .minutes(120), label: "2 heures"),
                              .init(value: .morning, label: "Jusqu’à demain"), .init(value: .custom, label: "Jusqu’à…")],
                    subs: [.morning: "reprise à 7 h", .custom: "heure précise"], value: $choice, columns: 2)
            if choice == .custom {
                DatePicker("Reprise à", selection: $custom, displayedComponents: .hourAndMinute).ui(14)
            }
        } footer: {
            if cur != nil {
                Btn("Reprendre maintenant", kind: .ghost, icon: "play") { if await store.resume(host) { dismiss() } }
            }
            Spacer(minLength: 0)
            Btn(cur != nil ? "Modifier la pause" : "Mettre en pause", kind: .go, icon: "pause") { if await store.pause(host, until: until) { dismiss() } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Wi-Fi invité (`GuestSheet`) : durée, avertissement de redémarrage du Wi-Fi.
struct GuestSheet: View {
    var store: PanelStore
    @State private var minutes = 240
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    var body: some View {
        let enabled = store.guestOn
        SheetScaffold(title: "Wi-Fi invité", description: store.w["ssid"]["guest"]["id"].string) {
            Banner(tone: .brand, icon: "wifi", text: Text("Coupure Wi-Fi d’environ 40 secondes.").bold() + Text(" Pour activer ou couper le réseau invité, la Bbox redémarre son Wi-Fi : les appareils sans fil se reconnectent ensuite seuls."))
            if enabled {
                HStack(spacing: 8) {
                    Chip("Actif", tone: .ok, dot: true)
                    Text(store.guestTimer.map { "coupure automatique \(Fmt.until($0.until))" } ?? "sans limite de durée").ui(13.5).foregroundStyle(p.mutedForeground)
                }
            } else {
                Note("Pendant combien de temps ?")
                Choices(options: store.isRelay
                            ? [.init(value: 60, label: "1 heure"), .init(value: 240, label: "4 heures"), .init(value: 1440, label: "24 heures"), .init(value: 0, label: "Sans limite")]
                            : [.init(value: 0, label: "Sans limite")],
                        value: $minutes, columns: 2)
                if !store.isRelay { Note("La coupure automatique est faite par le relais : sans lui, le réseau invité reste ouvert jusqu’à ce que vous le coupiez.") }
            }
        } footer: {
            Spacer(minLength: 0)
            Btn("Annuler", kind: .ghost) { dismiss() }
            if enabled {
                Btn("Couper le Wi-Fi invité", kind: .danger, icon: "x") { if await store.setGuest(false) { dismiss() } }
            } else {
                Btn("Activer", kind: .go, icon: "link") { if await store.setGuest(true, minutes: store.isRelay ? minutes : 0) { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { if !store.isRelay { minutes = 0 } }
    }
}

/// Actions rapides épinglables (`ACTIONS` de web/src/lib/prefs.ts) disponibles dans l'app.
struct QuickAction: Identifiable {
    var id: String
    var label: String
    var icon: String

    static let all: [QuickAction] = [
        .init(id: "guest1h", label: "Wi-Fi invité pendant 1 heure", icon: "link"),
        .init(id: "guest4h", label: "Wi-Fi invité pendant 4 heures", icon: "link"),
        .init(id: "guestoff", label: "Couper le Wi-Fi invité", icon: "link"),
        .init(id: "theme", label: "Basculer entre clair et sombre", icon: "moon"),
    ]
    static func of(_ id: String) -> QuickAction? { all.first { $0.id == id } }

    @MainActor func run(_ store: PanelStore, _ appearance: Appearance, dark: Bool) async {
        switch id {
        case "guest1h": await store.setGuest(true, minutes: 60)
        case "guest4h": await store.setGuest(true, minutes: 240)
        case "guestoff": await store.setGuest(false)
        case "theme": appearance.pref = dark ? .light : .dark
        default: break
        }
    }
}

/// Choix des favoris (`FavoritesSheet`), partagés entre tous les appareils par le relais.
struct FavoritesSheet: View {
    var store: PanelStore
    @State private var devs: Set<String> = []
    @State private var acts: Set<String> = []
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    var body: some View {
        let hosts = store.hosts.sorted { ($0.active ? 1 : 0, store.name(of: $1)) > ($1.active ? 1 : 0, store.name(of: $0)) }
        SheetScaffold(title: "Favoris", description: "Partagés entre tous vos appareils") {
            SectionTitle("Appareils", first: true)
            VStack(spacing: 0) {
                ForEach(Array(hosts.enumerated()), id: \.element.id) { i, h in
                    Row(first: i == 0, action: { toggle(&devs, h.mac) }) {
                        Avatar(icon: h.kindIcon, size: .sm, on: h.active)
                        Text(store.name(of: h)).ui(14.5, .medium).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                        LucideIcon("star", size: 18).foregroundStyle(devs.contains(h.mac) ? p.warn : p.faint)
                    }
                }
            }
            .padding(.horizontal, p.isGeist ? 0 : -20)
            SectionTitle("Actions")
            VStack(spacing: 0) {
                ForEach(Array(QuickAction.all.enumerated()), id: \.element.id) { i, a in
                    Row(first: i == 0, action: { toggle(&acts, a.id) }) {
                        Avatar(icon: a.icon, size: .sm, tone: .brand)
                        Text(a.label).ui(14.5, .medium).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                        LucideIcon("star", size: 18).foregroundStyle(acts.contains(a.id) ? p.warn : p.faint)
                    }
                }
            }
            .padding(.horizontal, p.isGeist ? 0 : -20)
        } footer: {
            Spacer(minLength: 0)
            Btn("Annuler", kind: .ghost) { dismiss() }
            Btn("Enregistrer", kind: .go, icon: "check") {
                await store.setFavorites(devices: Array(devs), actions: QuickAction.all.map(\.id).filter(acts.contains))
                dismiss()
            }
        }
        .onAppear { devs = Set(store.prefs.favDevices); acts = Set(store.prefs.favActions) }
    }

    private func toggle(_ set: inout Set<String>, _ id: String) {
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
    }
}
