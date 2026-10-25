import SwiftUI

/// En-tête commun aux écrans d'accueil : logo et nom de l'app, comme `Login` du web (components/login.tsx).
struct BrandHeader: View {
    var subtitle: String?
    @Environment(\.palette) private var p

    var body: some View {
        VStack(spacing: 0) {
            BrandLogo(size: p.isGeist ? 48 : 64, color: p.isGeist ? p.foreground : p.logo)
            Text(Edition.appName).ui(p.isGeist ? 22 : 30, .semibold, tracking: p.isGeist ? -0.02 : -0.035)
                .padding(.top, p.isGeist ? 16 : 18)
            if let subtitle {
                Text(subtitle).ui(14).foregroundStyle(p.mutedForeground).multilineTextAlignment(.center).padding(.top, 10)
            }
        }
    }
}

struct SearchingView: View {
    var message: String
    @Environment(\.palette) private var p

    var body: some View {
        VStack(spacing: 28) {
            BrandHeader()
            HStack(spacing: 10) {
                ProgressView()
                Text(message).ui(14).foregroundStyle(p.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LoginBackground())
    }
}

struct LoginView: View {
    var target: Target
    @Environment(ConnectionManager.self) private var connection
    @Environment(Appearance.self) private var appearance
    @State private var password = ""
    @State private var show = false
    @State private var busy = false
    @State private var error: String?
    @State private var shake: CGFloat = 0
    @State private var showSettings = false
    @FocusState private var focused: Bool
    @Environment(\.palette) private var p
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let err = error ?? connection.notice
        let h: CGFloat = p.isGeist ? 48 : 56, r: CGFloat = p.isGeist ? 8 : 16
        ScrollView {
            VStack(spacing: 0) {
                BrandHeader().padding(.bottom, p.isGeist ? 28 : 30)
                HStack(spacing: 2) {
                    LucideIcon("lock", size: 18).foregroundStyle(p.mutedForeground)
                    Group {
                        if show { TextField("Mot de passe", text: $password) } else { SecureField("Mot de passe", text: $password) }
                    }
                    .ui(16, .medium)
                    .textContentType(.password).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.go).focused($focused).onSubmit(submit)
                    .padding(.leading, 10).padding(.trailing, 6)
                    .onChange(of: password) { if error != nil { error = nil } }
                    Button { show.toggle() } label: {
                        LucideIcon(show ? "eyeoff" : "eye", size: p.isGeist ? 16 : 18).foregroundStyle(p.mutedForeground)
                            .frame(width: p.isGeist ? 36 : 38, height: p.isGeist ? 36 : 38)
                    }
                    .accessibilityLabel(show ? "Masquer le mot de passe" : "Afficher le mot de passe")
                    Button(action: submit) {
                        Group {
                            if busy { ProgressView().tint(p.primaryForeground) } else { LucideIcon("arrowright", size: 18) }
                        }
                        .foregroundStyle(p.primaryForeground)
                        .frame(width: p.isGeist ? 36 : 42, height: p.isGeist ? 36 : 42)
                        .background(p.primary, in: RoundedRectangle(cornerRadius: p.isGeist ? 6 : 12, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                    .disabled(password.isEmpty || busy).opacity(password.isEmpty || busy ? 0.3 : 1)
                    .accessibilityLabel("Se connecter")
                }
                .padding(.leading, p.isGeist ? 14 : 16).padding(.trailing, p.isGeist ? 6 : 7)
                .frame(height: h)
                .background(p.isGeist ? p.field : p.card, in: RoundedRectangle(cornerRadius: r, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: r, style: .continuous)
                        .strokeBorder(err != nil ? p.danger : focused ? (p.isGeist ? p.foreground.opacity(0.32) : p.brand) : (p.isGeist ? .clear : p.border),
                                      lineWidth: err != nil || (focused && !p.isGeist) ? 1.5 : 1)
                }
                .shadow(color: p.isGeist ? .clear : Color(hex: 0x102030, alpha: 0.22), radius: 16, y: 12)
                .offset(x: shake)
                Text(err ?? " ").ui(13.5, .medium).foregroundStyle(p.danger).multilineTextAlignment(.center)
                    .frame(minHeight: 20).padding(.top, 12)
                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        LucideIcon(target.isRelay ? "server" : target.isAway ? "globe" : "router", size: 14)
                        Text("\(target.title) · \(target.hostLabel)").lineLimit(1)
                    }
                    .ui(13).foregroundStyle(p.mutedForeground)
                    Text("Le mot de passe n’est jamais enregistré : seule la session l’est, dans le trousseau de cet appareil.")
                        .ui(12.5).foregroundStyle(p.mutedForeground).multilineTextAlignment(.center)
                    if !target.isRelay {
                        Text("Sans relais, l’app parle directement à la Bbox : pas de temps réel, d’historique ni de minuteurs.")
                            .ui(12.5).foregroundStyle(p.mutedForeground).multilineTextAlignment(.center)
                    }
                }
                .padding(.top, 8)
                Btn("Changer de connexion", kind: .plain, size: .sm, icon: "settings") { showSettings = true }.padding(.top, 12)
            }
            .frame(maxWidth: 380)
            .padding(.horizontal, 24)
            .offset(y: -100) // ≈ -12vh du web sur iPhone
            .frame(maxWidth: .infinity)
            .containerRelativeFrame(.vertical)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(LoginBackground())
        .overlay(alignment: .topTrailing) {
            IconBtn(icon: scheme == .dark ? "sun" : "moon", label: scheme == .dark ? "Passer en clair" : "Passer en sombre") {
                appearance.pref = scheme == .dark ? .light : .dark
            }
            .padding(.trailing, 14)
        }
        .sheet(isPresented: $showSettings) { ConnectionSettingsView() }
    }

    private func submit() {
        guard !password.isEmpty, !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await connection.login(password: password)
                password = ""
            } catch {
                self.error = (error as? LocalizedError)?.errorDescription ?? "Connexion impossible"
                connection.notice = nil
                // secousse du champ, comme le web
                for x in [-8.0, 7, -4, 2, 0] { withAnimation(.easeOut(duration: 0.08)) { shake = x }; try? await Task.sleep(for: .milliseconds(80)) }
            }
        }
    }
}

struct UnreachableView: View {
    @Environment(ConnectionManager.self) private var connection
    @Environment(\.palette) private var palette
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 24) {
            BrandHeader(subtitle: "Ni relais du panel ni Bbox ne répondent.")
            VStack(alignment: .leading, spacing: 10) {
                Label("À la maison : vérifiez que l’iPhone est connecté au Wi-Fi de la Bbox.", systemImage: "house")
                Label("En déplacement : renseignez l’accès distant de la Bbox ou l’adresse de votre relais.", systemImage: "globe")
            }
            .appFont(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 24)
            if let notice = connection.notice {
                Text(notice).appFont(.footnote).foregroundStyle(palette.danger)
            }
            VStack(spacing: 10) {
                Button { connection.connect() } label: {
                    Text("Réessayer").bold().foregroundStyle(palette.brandForeground).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Button("Paramètres de connexion") { showSettings = true }
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 480)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LoginBackground())
        .sheet(isPresented: $showSettings) { ConnectionSettingsView() }
    }
}


/// Fond de l'écran de connexion du web (`.login-bg`) : halo et anneaux concentriques en Bbox Clair, fond uni en Noir Geist.
private struct LoginBackground: View {
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var still
    @State private var breathe = false

    var body: some View {
        let glow = p.dark ? Color(hex: 0x4cc0d4, alpha: 0.13) : Color(hex: 0x0c7b91, alpha: 0.16)
        let ring = p.dark ? Color(hex: 0xa9c3d6, alpha: 0.09) : Color(hex: 0x182b3b, alpha: 0.09)
        GeometryReader { g in
            let c = CGPoint(x: g.size.width / 2, y: g.size.height * 0.44)
            ZStack {
                p.background
                if !p.isGeist {
                    RadialGradient(colors: [glow, .clear], center: UnitPoint(x: 0.5, y: 0.44), startRadius: 0, endRadius: 320)
                    // anneaux du SVG 800 × 800 affiché sur 820 pt (rayons 120 à 360), qui « respirent » lentement
                    ForEach([120.0, 200, 280, 360].enumerated().map { $0 }, id: \.offset) { i, r in
                        Circle().stroke(ring, lineWidth: 1)
                            .frame(width: r * 2.05, height: r * 2.05)
                            .scaleEffect(still ? 1 : breathe ? 1.025 : 0.975)
                            .opacity(still ? 1 : breathe ? 1 : 0.5)
                            .animation(still ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 8).repeatForever(autoreverses: true).delay(Double(i) * 0.6), value: breathe)
                            .position(c)
                    }
                }
            }
        }
        .ignoresSafeArea()
        .onAppear { breathe = true }
    }
}
