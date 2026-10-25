import SwiftUI

/// « Plus » (`views/more.tsx`) : autres écrans, outils, mode clair/sombre, déconnexion.
struct MoreScreen: View {
    var store: PanelStore
    @Environment(Navigator.self) private var nav
    @Environment(Appearance.self) private var appearance
    @Environment(ConnectionManager.self) private var connection
    @Environment(\.palette) private var p

    var body: some View {
        Page(title: "Plus") {
            PageHead(kicker: "Ma Bbox", title: "Plus")
            Card(flush: true) {
                LinkRow(icon: "box", title: "Ma Bbox", sub: "Matériel, santé, redémarrage", first: true) { nav.plusPath.append("bbox") }
            }
            SectionTitle("Outils")
            Card(flush: true) {
                LinkRow(icon: "palette", title: "Apparence", sub: appearance.skin.name, first: true) { nav.plusPath.append("apparence") }
                LinkRow(icon: "server", title: "Connexion", sub: store.target.title) { nav.plusPath.append("connexion") }
            }
            SectionTitle("Mode")
            Card {
                Seg(options: ThemePref.allCases.map { SegOption(value: $0, label: $0.label) },
                    value: Binding(get: { appearance.pref }, set: { appearance.pref = $0 }), block: true)
                Note("Apparence actuelle : \(appearance.skin.name).").padding(.top, 10)
            }
            Btn("Se déconnecter", kind: .dangerGhost, size: .lg, icon: "logout", block: true) { await connection.logout() }
                .padding(.top, 24)
            Text("\(Edition.appName) v\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—") · \(store.isRelay ? "relais du panel" : "Bbox en direct")")
                .ui(p.isGeist ? 12.5 : 13).foregroundStyle(p.mutedForeground).frame(maxWidth: .infinity).padding(.top, 14)
        }
    }
}

/// Lien vers un écran (`LinkRow` de more.tsx).
struct LinkRow: View {
    var icon: String
    var title: String
    var sub: String?
    var first = false
    var action: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        Row(first: first, action: action) {
            Avatar(icon: icon, size: .sm, tone: .brand)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).ui(15, p.isGeist ? .medium : .semibold).lineLimit(1)
                if let sub { Text(sub).ui(13).foregroundStyle(p.mutedForeground).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            LucideIcon("chevron", size: 18).foregroundStyle(p.mutedForeground)
        }
    }
}

/// Apparence (`views/appearance.tsx`, version iPhone) : vignettes Bbox Clair / Noir Geist, mode, prénom de l'accueil.
struct AppearanceScreen: View {
    @Environment(Appearance.self) private var appearance
    @Environment(PanelStore.self) private var store
    @State private var owner = ""
    @Environment(\.palette) private var p

    var body: some View {
        Page(title: "Apparence", back: true) {
            PageHead(kicker: "Réglages", title: "Apparence", sub: "Deux apparences complètes, chacune en clair et en sombre.") {
                Seg(options: ThemePref.allCases.map { SegOption(value: $0, label: $0.label) },
                    value: Binding(get: { appearance.pref }, set: { appearance.pref = $0 }), small: true)
            }
            VStack(spacing: 20) {
                ForEach(Skin.allCases) { s in skinCard(s) }
                if store.isRelay {
                    Card("Accueil", icon: "home") {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Votre prénom").ui(13, .medium)
                            TextField("Prénom", text: $owner).ui(16).textContentType(.givenName)
                                .padding(.horizontal, 12).frame(height: 44)
                                .background(p.isGeist ? p.field : p.card, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous).strokeBorder(p.isGeist ? .clear : p.input, lineWidth: 1) }
                                .onSubmit { Task { await store.setOwner(owner) } }
                            Note("Pour la salutation de l’accueil (« \(Fmt.hello()) »). Commun à tous vos écrans.")
                        }
                    }
                }
            }
            Note("Ces choix sont mémorisés sur cet appareil (sauf le prénom, commun à tous vos écrans). « Auto » suit le réglage clair/sombre d’iOS.").padding(.top, 16)
        }
        .onAppear { owner = store.prefs.owner }
        .onDisappear { Task { await store.setOwner(owner) } }
    }

    private func skinCard(_ s: Skin) -> some View {
        let on = appearance.skin == s
        return VStack(spacing: 0) {
            Button { appearance.select(s) } label: { Swatch(skin: s) }.buttonStyle(.plain).accessibilityLabel("Utiliser \(s.name)")
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(s.name).ui(17, .semibold, tracking: -0.01)
                        if on { Chip("Utilisée", tone: .brand) }
                    }
                    Text(s.summary).ui(13.5).foregroundStyle(p.mutedForeground).fixedSize(horizontal: false, vertical: true)
                    Note("Police \(s == .clair ? (Edition.isPerso ? "Bouygues Read" : "système") : "Geist") · \(s == .clair ? "clair" : "sombre") par défaut")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if on {
                    HStack(spacing: 6) { LucideIcon("check", size: 16); Text("Sélectionnée").ui(13, .semibold) }
                        .padding(.horizontal, 14).frame(height: 36)
                        .foregroundStyle(p.isGeist ? p.foreground : p.brandInk)
                        .background(p.isGeist ? p.secondary : p.brandSoft, in: RoundedRectangle(cornerRadius: p.isGeist ? 8 : 18, style: .continuous))
                } else {
                    Btn("Utiliser", kind: .go, size: .sm) { appearance.select(s) }
                }
            }
            .padding(16)
        }
        .cardSurface()
        .overlay {
            if on {
                RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous)
                    .strokeBorder(p.isGeist ? p.foreground : p.brand, lineWidth: p.isGeist ? 1 : 2)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous))
    }
}

/// Vignette stylisée d'une apparence (`Swatch` d'appearance.tsx), avec ses couleurs fixes.
private struct Swatch: View {
    var skin: Skin

    var body: some View {
        Group {
            if skin == .geist {
                VStack(spacing: 0) {
                    HStack(spacing: 6) {
                        Circle().fill(.white).frame(width: 10, height: 10)
                        Capsule().fill(Color(hex: 0x3a3a3a)).frame(width: 40, height: 6)
                        Spacer()
                        Capsule().fill(Color(hex: 0x2e2e2e)).frame(width: 24, height: 6)
                    }
                    .padding(.horizontal, 12).frame(height: 28)
                    .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: 0x1f1f1f)).frame(height: 1) }
                    HStack(alignment: .bottom, spacing: 12) {
                        Capsule().fill(Color(hex: 0xededed)).frame(width: 32, height: 6)
                        Capsule().fill(Color(hex: 0x3a3a3a)).frame(width: 32, height: 6)
                        Capsule().fill(Color(hex: 0x3a3a3a)).frame(width: 32, height: 6)
                        Spacer()
                    }
                    .padding(.horizontal, 12).padding(.bottom, 6).frame(height: 24, alignment: .bottom)
                    .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: 0x1f1f1f)).frame(height: 1) }
                    HStack(spacing: 8) {
                        ForEach(0..<3, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 6).fill(Color(hex: 0x0a0a0a))
                                .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: 0x1f1f1f), lineWidth: 1) }
                        }
                    }
                    .padding(12)
                }
                .background(.black)
            } else {
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 6) {
                        Circle().fill(.white).frame(width: 12, height: 12).padding(.bottom, 4)
                        ForEach(0..<4, id: \.self) { i in Capsule().fill(i == 0 ? Color(hex: 0x5fd0e2) : .white.opacity(0.2)).frame(height: 6) }
                        Spacer()
                    }
                    .padding(10).frame(width: 56).background(Color(hex: 0x182b3b))
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(0..<4, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 12).fill(.white).frame(height: 52).shadow(color: Color(hex: 0x102030).opacity(0.08), radius: 1.5, y: 1)
                        }
                    }
                    .padding(12)
                }
                .background(Color(hex: 0xeef2f5))
            }
        }
        .frame(height: 144)
        .frame(maxWidth: .infinity)
    }
}

/// Connexion : cible actuelle et réglages du relais / de l'accès distant (propre à l'app).
struct ConnectionScreen: View {
    var store: PanelStore
    @Environment(ConnectionManager.self) private var connection
    @State private var settings = false

    var body: some View {
        Page(title: "Connexion", back: true) {
            PageHead(kicker: "Réglages", title: "Connexion", sub: "Comment l’app joint votre Bbox")
            VStack(spacing: 12) {
                Card("Connexion actuelle", icon: "server") {
                    KV([kv("Mode", store.target.title), kv("Adresse", store.target.hostLabel),
                        kv("Temps réel", store.isRelay ? (store.liveConnected ? "connecté" : "reconnexion…") : "relevé toutes les 5 s")])
                    if store.target.relayReachesBboxRemotely {
                        Note("Ce relais joint la Bbox par son accès distant.").padding(.top, 10)
                    }
                    if !store.isRelay {
                        Note("Sans le relais, l’app lit la Bbox directement : pas d’historique, d’évènements ni de minuteurs.").padding(.top, 10)
                    }
                }
                Btn("Paramètres de connexion", kind: .soft, size: .lg, icon: "settings", block: true) { settings = true }
                Btn("Se déconnecter", kind: .dangerGhost, size: .lg, icon: "logout", block: true) { await connection.logout() }
            }
        }
        .sheet(isPresented: $settings) { ConnectionSettingsView() }
    }
}
