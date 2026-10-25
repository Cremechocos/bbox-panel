import SwiftUI

// Coque de l'app sur iPhone, reprise de `MobileHeader` / `TabBar` (web/src/App.tsx) pour Bbox Clair et de
// `LigneMobileHeader` / `LigneTabBar` (components/shell-ligne.tsx) pour Noir Geist.

enum AppTab: String, CaseIterable, Identifiable {
    case accueil, appareils, wifi, activite, plus
    var id: String { rawValue }
    var label: String {
        switch self {
        case .accueil: "Accueil"
        case .appareils: "Appareils"
        case .wifi: "Wi-Fi"
        case .activite: "Activité"
        case .plus: "Plus"
        }
    }
    var icon: String {
        switch self {
        case .accueil: "house"
        case .appareils: "monitor-smartphone"
        case .wifi: "wifi"
        case .activite: "bell"
        case .plus: "ellipsis"
        }
    }
}

/// Navigation partagée : onglet courant, fiche d'appareil, notifications, recherche.
@Observable @MainActor
final class Navigator {
    var tab: AppTab = .accueil
    var device: Host?
    var alerts = false
    var search = false
    var plusPath: [String] = []

    func go(_ tab: AppTab) {
        device = nil; alerts = false; search = false
        self.tab = tab
    }
}

struct Shell: View {
    @Bindable var store: PanelStore
    @State private var nav = Navigator()
    @Environment(\.palette) private var p

    var body: some View {
        TabView(selection: $nav.tab) {
            HomeScreen(store: store).tag(AppTab.accueil).toolbar(.hidden, for: .tabBar)
            DevicesScreen(store: store).tag(AppTab.appareils).toolbar(.hidden, for: .tabBar)
            WifiScreen(store: store).tag(AppTab.wifi).toolbar(.hidden, for: .tabBar)
            ActivityScreen(store: store).tag(AppTab.activite).toolbar(.hidden, for: .tabBar)
            NavigationStack(path: $nav.plusPath) {
                MoreScreen(store: store)
                    .navigationDestination(for: String.self) { id in
                        switch id {
                        case "bbox": BboxScreen(store: store)
                        case "apparence": AppearanceScreen()
                        default: ConnectionScreen(store: store)
                        }
                    }
            }
            .tag(AppTab.plus).toolbar(.hidden, for: .tabBar)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { TabBar(unread: store.unread) }
        .environment(nav)
        .environment(store)
        .sheet(item: $nav.device) { h in DeviceSheet(store: store, mac: h.mac).kitSheet() }
        .sheet(isPresented: $nav.alerts) { AlertsSheet(store: store).kitSheet() }
        .sheet(isPresented: $nav.search) { SearchSheet(store: store).kitSheet() }
        .overlay(alignment: .top) {
            if let toast = store.toast {
                ToastView(toast: toast)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { store.toast = nil }
                    .task(id: toast.id) {
                        try? await Task.sleep(for: .seconds(toast.isError ? 5 : 3))
                        if store.toast?.id == toast.id { store.toast = nil }
                    }
            }
        }
        .animation(.spring(duration: 0.35), value: store.toast)
        .background(p.background)
    }
}

// MARK: - Page

/// Écran du panel : en-tête collant, défilement, marges du `main` web (16 px, 8 px en haut sur iPhone).
struct Page<Content: View>: View {
    var title: String
    var back = false
    var refresh: (() async -> Void)?
    @ViewBuilder var content: Content
    @State private var offset: CGFloat = 0
    @Environment(\.palette) private var p

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) { content }
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 16)
                .padding(.top, 8) // `max-sm:pt-2` du `main` web, dans les deux apparences
                .padding(.bottom, 28)
                // position du haut du contenu dans la page : l'en-tête affiche le titre une fois défilé de 44 pt
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named("page")).minY } action: { offset = $0 }
        }
        .coordinateSpace(name: "page")
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await refresh?() }
        .background(p.background)
        .safeAreaInset(edge: .top, spacing: 0) { AppHeader(title: title, scrolled: offset < -44, back: back) }
        .toolbar(.hidden, for: .navigationBar)
    }
}

// MARK: - En-tête

struct AppHeader: View {
    var title: String
    var scrolled: Bool
    var back = false
    @Environment(Navigator.self) private var nav
    @Environment(PanelStore.self) private var box
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: p.isGeist ? 4 : 2) {
            Button { if back { dismiss() } else { nav.go(.accueil) } } label: {
                Group {
                    if back {
                        LucideIcon("back", size: 22).foregroundStyle(p.foreground)
                    } else if p.isGeist {
                        BrandLogo(size: 18, color: p.background)
                            .frame(width: 28, height: 28)
                            .background(p.foreground, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    } else {
                        BrandLogo(size: 28, color: p.logo)
                    }
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel(back ? "Retour" : "Accueil")
            .padding(.leading, p.isGeist ? -8 : 0)

            if p.isGeist {
                Text(title).ui(15, .semibold).lineLimit(1).padding(.leading, 2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ZStack(alignment: .leading) {
                    Text(title).opacity(scrolled ? 1 : 0).offset(y: scrolled ? 0 : 8)
                    Text(Edition.appName).opacity(scrolled ? 0 : 1).offset(y: scrolled ? -8 : 0)
                }
                .ui(16, .semibold, tracking: -0.01)
                .lineLimit(1)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .clipped()
                .animation(.easeOut(duration: 0.3), value: scrolled)
            }

            IconBtn(icon: "search", label: "Rechercher", size: p.isGeist ? 19 : 18) { nav.search = true }
            Button { nav.alerts = true } label: {
                LucideIcon("bell", size: 18).foregroundStyle(p.mutedForeground)
                    .frame(width: 44, height: 44)
                    .overlay(alignment: .topTrailing) {
                        if box.unread > 0 {
                            Text(box.unread > 99 ? "99+" : "\(box.unread)")
                                .ui(10, .bold).monospacedDigit().foregroundStyle(.white)
                                .padding(.horizontal, 4).frame(minWidth: 16, minHeight: 16)
                                .background(p.danger, in: Capsule())
                                .overlay(Capsule().stroke(p.background, lineWidth: 2))
                                .offset(x: -6, y: 6)
                        }
                    }
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel(box.unread > 0 ? "Notifications (\(box.unread) non lues)" : "Notifications")
        }
        .padding(.leading, p.isGeist ? 16 : 8)
        .padding(.trailing, 4)
        .frame(height: 56)
        .background {
            Rectangle().fill(.ultraThinMaterial).overlay(p.background.opacity(p.isGeist ? 0.86 : 0.8)).ignoresSafeArea(edges: .top)
        }
        .overlay(alignment: .bottom) {
            if !p.isGeist { Rectangle().fill(p.border).frame(height: 1).opacity(scrolled ? 1 : 0).animation(.easeOut(duration: 0.3), value: scrolled) }
        }
    }
}

// MARK: - Barre d'onglets

struct TabBar: View {
    var unread: Int
    @Environment(Navigator.self) private var nav
    @Namespace private var ns
    @Environment(\.palette) private var p

    var body: some View {
        let row = HStack(spacing: 0) {
            ForEach(AppTab.allCases) { t in
                let on = nav.tab == t
                Button {
                    withAnimation(p.isGeist ? .spring(response: 0.3, dampingFraction: 0.85) : .timingCurve(0.22, 1, 0.36, 1, duration: 0.42)) {
                        if on && t == .plus { nav.plusPath = [] }
                        nav.go(t)
                    }
                } label: {
                    VStack(spacing: p.isGeist ? 4 : 3) {
                        ZStack {
                            if on {
                                Capsule().fill(p.isGeist ? p.selected : p.brandSoft)
                                    .frame(width: p.isGeist ? 48 : 56, height: p.isGeist ? 28 : 32)
                                    .matchedGeometryEffect(id: "pill", in: ns)
                            }
                            LucideIcon(t.icon, size: p.isGeist ? 20 : 22)
                                .overlay(alignment: .topTrailing) {
                                    if t == .activite && unread > 0 {
                                        Text(unread > 99 ? "99+" : "\(unread)")
                                            .ui(10, .bold).monospacedDigit().foregroundStyle(.white)
                                            .padding(.horizontal, 4).frame(minWidth: 16, minHeight: 16)
                                            .background(p.danger, in: Capsule())
                                            .overlay { if !p.isGeist { Capsule().stroke(p.card, lineWidth: 2) } }
                                            .offset(x: p.isGeist ? 8 : 12, y: p.isGeist ? -6 : -4)
                                    }
                                }
                        }
                        .frame(height: p.isGeist ? 28 : 32)
                        Text(t.label).ui(10.5, .medium).lineLimit(1)
                    }
                    .foregroundStyle(on ? (p.isGeist ? p.foreground : p.brandInk) : p.mutedForeground)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(t.label)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .frame(height: 58)

        if p.isGeist {
            row
                .background {
                    RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.ultraThinMaterial)
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(p.glass))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(p.glassRing, lineWidth: 1))
                        .shadow(color: .black.opacity(p.dark ? 0.5 : 0.12), radius: 20, y: 8)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
        } else {
            row
                .frame(maxWidth: 512)
                .frame(maxWidth: .infinity)
                .background {
                    Rectangle().fill(.ultraThinMaterial).overlay(p.card.opacity(0.85)).ignoresSafeArea(edges: .bottom)
                }
                .overlay(alignment: .top) { Rectangle().fill(p.border).frame(height: 1) }
        }
    }
}

// MARK: - Notifications

struct AlertsSheet: View {
    var store: PanelStore
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p
    private static let hidden: Set<String> = ["wifi_restart", "port_up", "port_down", "voip_up", "login"]

    var body: some View {
        let evs = store.events.filter { !Self.hidden.contains($0.type) }
        let list = Array((evs.filter { !$0.ack } + evs.filter(\.ack)).prefix(25))
        VStack(spacing: 0) {
            SheetHeader(title: "Notifications") {
                if store.unread > 0 {
                    Btn("Tout marquer comme lu", kind: .plain, size: .xs) { await store.ackEvents() }
                }
            }
            ScrollView {
                if list.isEmpty {
                    EmptyState(icon: "bell", title: "Aucune notification", text: "Les arrivées, alertes et actions apparaîtront ici en temps réel.")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                            EventRow(store: store, event: e, first: i == 0) { nav.go(.activite) }
                        }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Évènement récent (accueil, notifications).
struct EventRow: View {
    var store: PanelStore
    var event: PanelEvent
    var first = false
    var action: (() -> Void)?
    @Environment(\.palette) private var p

    var body: some View {
        let info = event.info { mac in store.host(mac: mac).map(store.name(of:)) }
        Row(first: first, minHeight: 58, action: action) {
            Avatar(icon: info.icon, size: .sm, tone: info.tone)
            VStack(alignment: .leading, spacing: 0) {
                Text(info.title).ui(14, .medium).lineLimit(1)
                Text([Fmt.ago(event.t), info.sub].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .ui(13).foregroundStyle(p.mutedForeground).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !event.ack { Circle().fill(p.warn).frame(width: 8, height: 8).accessibilityLabel("Non lu") }
        }
    }
}

// MARK: - Recherche

/// Palette de recherche (⌘K du web) : écrans et appareils.
struct SearchSheet: View {
    var store: PanelStore
    @State private var q = ""
    @FocusState private var focused: Bool
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p

    private func match(_ s: String) -> Bool {
        let needle = q.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return needle.isEmpty || s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current).contains(needle)
    }

    var body: some View {
        let pages = AppTab.allCases.filter { match($0.label) }
        let devices = store.hosts.filter { match(store.name(of: $0)) || match($0.ip) }.prefix(12)
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                LucideIcon("search", size: 18).foregroundStyle(p.mutedForeground)
                TextField("Rechercher un écran, un appareil…", text: $q)
                    .ui(16).focused($focused).submitLabel(.search)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            .padding(.horizontal, 20).frame(height: 56)
            .overlay(alignment: .bottom) { Rectangle().fill(p.border).frame(height: 1) }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if !pages.isEmpty {
                        SectionTitle("Écrans").padding(.horizontal, 16).padding(.top, 12)
                        ForEach(Array(pages.enumerated()), id: \.element) { i, t in
                            Row(first: i == 0, action: { nav.go(t) }) {
                                Avatar(icon: t.icon, size: .sm, tone: .brand)
                                Text(t.label).ui(15, p.isGeist ? .medium : .semibold).frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    if !devices.isEmpty {
                        SectionTitle("Appareils").padding(.horizontal, 16)
                        ForEach(Array(devices.enumerated()), id: \.element.id) { i, h in
                            Row(first: i == 0, action: { nav.search = false; Task { try? await Task.sleep(for: .milliseconds(350)); nav.device = h } }) {
                                Avatar(icon: h.kindIcon, size: .sm, on: h.active)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(store.name(of: h)).ui(14.5, .medium).lineLimit(1)
                                    Text(h.ip).ui(13).monospacedDigit().foregroundStyle(p.mutedForeground)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                }
                .padding(.bottom, 24)
            }
        }
        .onAppear { focused = true }
        .presentationDetents([.large])
    }
}

/// Bandeau de résultat d'une action (`toast` du web).
struct ToastView: View {
    var toast: Toast
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: 10) {
            LucideIcon(toast.isError ? "triangle-alert" : "circle-check", size: 18)
                .foregroundStyle(toast.isError ? p.danger : p.ok)
            Text(toast.text).ui(14, .medium).foregroundStyle(p.foreground).lineLimit(3)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background {
            RoundedRectangle(cornerRadius: p.isGeist ? p.radius : 16, style: .continuous).fill(.ultraThinMaterial)
                .overlay(RoundedRectangle(cornerRadius: p.isGeist ? p.radius : 16, style: .continuous).fill(p.popover.opacity(0.9)))
                .overlay(RoundedRectangle(cornerRadius: p.isGeist ? p.radius : 16, style: .continuous).strokeBorder(p.border, lineWidth: 1))
        }
        .shadow(color: .black.opacity(0.14), radius: 16, y: 6)
        .padding(.horizontal, 16)
    }
}

/// Chargement initial commun aux écrans.
struct LoadingPlaceholder: View {
    @Environment(\.palette) private var p
    var body: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Lecture de la Bbox…").ui(14).foregroundStyle(p.mutedForeground)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }
}
