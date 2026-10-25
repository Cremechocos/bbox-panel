import SwiftUI

// Kit d'interface repris de `web/src/components/kit.tsx`, aux mesures du panel web sur iPhone
// (1 px CSS = 1 pt). Chaque composant suit les deux apparences : Bbox Clair (cartes) et Noir Geist (listes).

// MARK: - Icônes

/// Icône Lucide (même jeu que le web), dessinée depuis le catalogue d'images en mode modèle.
struct LucideIcon: View {
    var name: String
    var size: CGFloat

    /// `name` : nom Lucide (« house ») ou nom historique du panel web (« home », voir `Icons.web`).
    init(_ name: String, size: CGFloat = 18) {
        self.name = Icons.web[name] ?? name
        self.size = size
    }

    var body: some View {
        Image("lucide-" + name)
            .renderingMode(.template)
            .resizable()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

enum Icons {
    /// Noms historiques du panel (`ICONS` de web/src/components/icon.tsx) → icône Lucide.
    static let web: [String: String] = [
        "home": "house", "devices": "monitor-smartphone", "network": "network", "clock": "clock", "phone": "smartphone",
        "telephone": "smartphone", "box": "router", "more": "ellipsis", "chevron": "chevron-right", "back": "chevron-left",
        "trash": "trash", "edit": "pencil", "eyeoff": "eye-off", "refresh": "refresh-cw", "ethernet": "ethernet-port",
        "mobile": "smartphone", "game": "gamepad-2", "homeauto": "lightbulb", "generic": "monitor-smartphone", "down": "arrow-down",
        "up": "arrow-up", "alert": "triangle-alert", "qr": "qr-code", "logout": "log-out", "bolt": "zap", "thermo": "thermometer",
        "fiber": "cable", "sliders": "sliders-horizontal", "starfill": "star", "chart": "chart-column", "arrowright": "arrow-right",
        "userplus": "user-plus", "print": "printer", "expand": "maximize-2", "stop": "square",
    ]
}

// MARK: - Couleurs

extension Color {
    /// `color-mix(in oklab, self t%, other)` approché en sRGB (suffisant pour ces teintes voisines).
    func mix(_ other: Color, _ t: Double) -> Color {
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        UIColor(self).getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        UIColor(other).getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let u = CGFloat(t)
        return Color(.sRGB, red: Double(r1 * u + r2 * (1 - u)), green: Double(g1 * u + g2 * (1 - u)),
                     blue: Double(b1 * u + b2 * (1 - u)), opacity: Double(a1 * u + a2 * (1 - u)))
    }
}

extension Palette {
    var isGeist: Bool { skin == .geist }
    /// Rayons du thème web (`--radius-sm` … `--radius-2xl`).
    var radiusSM: CGFloat { radius - 6 }
    var radiusMD: CGFloat { radius - 3 }
    var radiusXL: CGFloat { radius + 4 }
    var radius2XL: CGFloat { radius + 8 }
    /// `--secondary-foreground` (égal à `--primary` dans les quatre variantes).
    var secondaryForeground: Color { primary }
    /// Texte des onglets et segments non choisis : `color-mix(muted-foreground 75 %, foreground)`.
    var idleText: Color { mutedForeground.mix(foreground, 0.75) }
    var gridLine: Color {
        switch (skin, dark) {
        case (.clair, false): return Color(hex: 0x132331, alpha: 0.07)
        case (.clair, true): return Color(hex: 0xe7eef4, alpha: 0.06)
        case (.geist, false): return Color(hex: 0x000000, alpha: 0.06)
        case (.geist, true): return Color(hex: 0xffffff, alpha: 0.06)
        }
    }
    /// Teinte d'avatar par défaut : `color-mix(foreground 80 %, brand)` en Bbox Clair.
    var avatarInk: Color { isGeist ? mutedForeground : foreground.mix(brand, 0.8) }
}

enum Tone {
    case neutral, ok, warn, danger, brand, off

    func colors(_ p: Palette) -> (fg: Color, bg: Color) {
        switch self {
        case .neutral: return (p.secondaryForeground, p.secondary)
        case .ok: return (p.ok, p.okSoft)
        case .warn: return (p.warn, p.warnSoft)
        case .danger: return (p.danger, p.dangerSoft)
        case .brand: return (p.brandInk, p.brandSoft)
        case .off: return (p.mutedForeground, p.secondary)
        }
    }
}

// MARK: - Texte

extension View {
    /// Police de l'apparence en px du web, avec l'interlettrage CSS en em.
    func ui(_ size: CGFloat, _ weight: Font.Weight = .regular, tracking em: CGFloat = 0) -> some View {
        appFont(size: size, weight).tracking(size * em)
    }
}

// MARK: - Mise en page

/// En-tête de page (`PageHead`) : surtitre, titre, sous-titre, actions empilées dessous sur iPhone.
struct PageHead<Actions: View>: View {
    var kicker: String?
    var title: String
    var sub: String?
    @ViewBuilder var actions: Actions
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                if let kicker, !p.isGeist {
                    Text(kicker.uppercased()).ui(12, .semibold, tracking: 0.08).foregroundStyle(p.brandInk).padding(.bottom, 6)
                }
                Text(title)
                    .ui(p.isGeist ? 22 : 28, .semibold, tracking: p.isGeist ? -0.02 : -0.025)
                    .foregroundStyle(p.foreground)
                    .lineSpacing(p.isGeist ? 0 : -2)
                    .fixedSize(horizontal: false, vertical: true)
                if let sub {
                    Text(sub).ui(p.isGeist ? 13 : 14.5).foregroundStyle(p.mutedForeground).padding(.top, p.isGeist ? 6 : 8)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            actions
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, p.isGeist ? 24 : 20)
    }
}

extension PageHead where Actions == EmptyView {
    init(kicker: String? = nil, title: String, sub: String? = nil) {
        self.init(kicker: kicker, title: title, sub: sub) { EmptyView() }
    }
}

/// Surface de carte (`card-surface`) : blanche et arrondie en Bbox Clair, rien en Noir Geist.
struct CardSurface: ViewModifier {
    @Environment(\.palette) private var p
    func body(content: Content) -> some View {
        if p.isGeist {
            content
        } else {
            let shape = RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous)
            content
                .background {
                    shape.fill(p.card)
                        .overlay(shape.strokeBorder(p.dark ? p.cardBorder : Color(hex: 0x132331, alpha: 0.05), lineWidth: 1))
                        .shadow(color: p.dark ? .black.opacity(0.3) : Color(hex: 0x132331, alpha: 0.04), radius: p.dark ? 1 : 1, y: 1)
                        .shadow(color: p.dark ? .clear : Color(hex: 0x132331, alpha: 0.07), radius: 10, y: 10)
                }
        }
    }
}

extension View {
    func cardSurface() -> some View { modifier(CardSurface()) }
}

/// Carte (`Card`) : titre avec icône, action à droite, contenu ; `flush` pour les listes bord à bord.
struct Card<Content: View, Action: View>: View {
    var title: String?
    var icon: String?
    var flush = false
    @ViewBuilder var action: Action
    @ViewBuilder var content: Content
    @Environment(\.palette) private var p

    init(_ title: String? = nil, icon: String? = nil, flush: Bool = false, @ViewBuilder action: () -> Action, @ViewBuilder content: () -> Content) {
        self.title = title; self.icon = icon; self.flush = flush
        self.action = action(); self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if title != nil || Action.self != EmptyView.self {
                HStack(spacing: 12) {
                    if let title {
                        HStack(spacing: p.isGeist ? 8 : 10) {
                            if let icon, !p.isGeist { LucideIcon(icon, size: 18).foregroundStyle(p.brand) }
                            Text(title).ui(p.isGeist ? 13.5 : 15, .semibold, tracking: p.isGeist ? 0 : -0.01).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    action
                }
                .frame(minHeight: 32)
                .padding(.top, flush && !p.isGeist ? 14 : 0)
                .padding(.horizontal, flush && !p.isGeist ? 16 : 0)
                .padding(.bottom, flush ? (p.isGeist ? 4 : 6) : (p.isGeist ? 8 : 14))
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(flush || p.isGeist ? 0 : 16)
        .padding(.vertical, flush && !p.isGeist ? 6 : 0)
        .cardSurface()
    }
}

extension Card where Action == EmptyView {
    init(_ title: String? = nil, icon: String? = nil, flush: Bool = false, @ViewBuilder content: () -> Content) {
        self.init(title, icon: icon, flush: flush, action: { EmptyView() }, content: content)
    }
}

/// Lien d'en-tête de carte (« Tout voir › »).
struct CardLink: View {
    var label: String
    var action: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        Button(action: action) {
            HStack(spacing: 2) {
                Text(label).ui(p.isGeist ? 12.5 : 13, p.isGeist ? .regular : .semibold)
                LucideIcon("chevron", size: 16)
            }
            .foregroundStyle(p.isGeist ? p.mutedForeground : p.brandInk)
            .padding(.horizontal, 8)
            .frame(height: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.trailing, -8)
    }
}

/// Liste clé → valeur (`KV`) : pointillés de liaison en Bbox Clair, colonnes en Noir Geist.
struct KV: View {
    var rows: [(String, AnyView)]
    @Environment(\.palette) private var p

    init(_ rows: [(String, AnyView)?]) { self.rows = rows.compactMap { $0 } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                if p.isGeist {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(row.0).foregroundStyle(p.mutedForeground).frame(width: 140, alignment: .leading)
                        row.1.frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 5)
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(row.0).foregroundStyle(p.mutedForeground).layoutPriority(1)
                        Leader().stroke(p.border, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [0.01, 3]))
                            .frame(minWidth: 12, maxWidth: .infinity).frame(height: 1.5)
                            .alignmentGuide(.firstTextBaseline) { d in d.height + 4 }
                        row.1.fontWeight(.semibold).multilineTextAlignment(.trailing).layoutPriority(1)
                    }
                    .frame(minHeight: 40)
                    .padding(.vertical, 0)
                }
            }
        }
        .ui(p.isGeist ? 13 : 14)
    }

    private struct Leader: Shape {
        func path(in rect: CGRect) -> Path {
            Path { $0.move(to: CGPoint(x: rect.minX, y: rect.midY)); $0.addLine(to: CGPoint(x: rect.maxX, y: rect.midY)) }
        }
    }
}

/// Texte simple pour `KV`.
func kv(_ key: String, _ value: String?) -> (String, AnyView) { (key, AnyView(Text(value ?? "—"))) }
func kv<V: View>(_ key: String, @ViewBuilder _ value: () -> V) -> (String, AnyView) { (key, AnyView(value())) }

/// Note (`Note`) : petit texte gris.
struct Note: View {
    var text: String
    init(_ text: String) { self.text = text }
    @Environment(\.palette) private var p
    var body: some View {
        Text(text).ui(p.isGeist ? 12.5 : 13).foregroundStyle(p.mutedForeground).lineSpacing(3)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Titre de section entre deux cartes (`SectionTitle`).
struct SectionTitle: View {
    var text: String
    var first = false
    init(_ text: String, first: Bool = false) { self.text = text; self.first = first }
    @Environment(\.palette) private var p
    var body: some View {
        Text(p.isGeist ? text : text.uppercased())
            .ui(p.isGeist ? 12.5 : 12, p.isGeist ? .medium : .semibold, tracking: p.isGeist ? 0 : 0.07)
            .foregroundStyle(p.mutedForeground)
            .padding(.horizontal, p.isGeist ? 0 : 4)
            .padding(.top, first ? 0 : (p.isGeist ? 32 : 24))
            .padding(.bottom, p.isGeist ? 8 : 10)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// État vide (`Empty`).
struct EmptyState: View {
    var icon = "info"
    var title: String
    var text: String?
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: p.isGeist ? .leading : .center, spacing: 6) {
            LucideIcon(icon, size: p.isGeist ? 18 : 22)
                .foregroundStyle(p.isGeist ? p.faint : p.mutedForeground)
                .frame(width: p.isGeist ? nil : 48, height: p.isGeist ? nil : 48)
                .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radius2XL, style: .continuous).fill(p.muted) } }
                .padding(.bottom, p.isGeist ? 4 : 8)
            Text(title).ui(p.isGeist ? 13.5 : 15, p.isGeist ? .medium : .semibold).foregroundStyle(p.foreground)
            if let text {
                Text(text).ui(p.isGeist ? 13 : 14).foregroundStyle(p.mutedForeground).lineSpacing(4)
                    .multilineTextAlignment(p.isGeist ? .leading : .center).frame(maxWidth: 360)
            }
        }
        .frame(maxWidth: .infinity, alignment: p.isGeist ? .leading : .center)
        .padding(.horizontal, p.isGeist ? 0 : 16)
        .padding(.vertical, p.isGeist ? 24 : 36)
    }
}

/// Bandeau (`Banner`).
struct Banner: View {
    var tone: Tone = .brand
    var icon: String?
    var text: Text
    @Environment(\.palette) private var p

    var body: some View {
        let c = tone.colors(p)
        HStack(spacing: 12) {
            if let icon { LucideIcon(icon, size: 18) }
            text.frame(maxWidth: .infinity, alignment: .leading)
            LucideIcon("chevron", size: 16).opacity(0.7)
        }
        .ui(p.isGeist ? 13 : 14)
        .foregroundStyle(c.fg)
        .padding(.horizontal, p.isGeist ? 12 : 16)
        .padding(.vertical, p.isGeist ? 10 : 12)
        .background(c.bg, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : p.radiusXL, style: .continuous))
    }
}

// MARK: - Puces

/// Puce (`Chip`) : capsule teintée, point facultatif.
struct Chip: View {
    var text: String
    var tone: Tone = .neutral
    var dot = false
    @Environment(\.palette) private var p

    init(_ text: String, tone: Tone = .neutral, dot: Bool = false) { self.text = text; self.tone = tone; self.dot = dot }

    var body: some View {
        let c = tone.colors(p)
        HStack(spacing: 6) {
            if dot { Circle().fill(c.fg).frame(width: 6, height: 6) }
            Text(text).ui(12, p.isGeist ? .medium : .semibold).lineLimit(1)
        }
        .foregroundStyle(c.fg)
        .padding(.horizontal, p.isGeist ? 8 : 10)
        .frame(height: p.isGeist ? 22 : 24)
        .background(c.bg, in: Capsule())
        .fixedSize()
    }
}

/// Point « en direct » (`.live-dot`) : pastille verte qui émet une onde.
struct LiveDot: View {
    var bad = false
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var still
    @State private var ping = false

    var body: some View {
        let color = bad ? p.danger : p.ok
        Circle().fill(color).frame(width: 8, height: 8)
            .background {
                Circle().fill(color)
                    .scaleEffect(ping ? 2.2 : 0.6).opacity(ping ? 0 : 0.7)
                    .animation(still ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 1.8).repeatForever(autoreverses: false), value: ping)
            }
            .onAppear { ping = true }
            .accessibilityHidden(true)
    }
}

// MARK: - Boutons

/// Bouton du kit (`Btn`) : variantes et tailles du web (hauteurs iPhone), roue d'attente si l'action est asynchrone.
struct Btn: View {
    enum Kind { case go, brand, soft, ghost, plain, danger, dangerGhost }
    enum Size { case xs, sm, md, lg }

    var label: String
    var kind: Kind = .go
    var size: Size = .md
    var icon: String?
    var block = false
    var disabled = false
    var action: () async -> Void
    @State private var busy = false
    @Environment(\.palette) private var p

    init(_ label: String, kind: Kind = .go, size: Size = .md, icon: String? = nil, block: Bool = false, disabled: Bool = false, action: @escaping () async -> Void) {
        self.label = label; self.kind = kind; self.size = size; self.icon = icon; self.block = block; self.disabled = disabled; self.action = action
    }

    var body: some View {
        let (fg, bg, stroke) = colors
        Button {
            guard !busy else { return }
            Task { busy = true; await action(); busy = false }
        } label: {
            HStack(spacing: size == .md || size == .lg ? 8 : 6) {
                if busy { ProgressView().controlSize(.small).tint(fg) } else if let icon { LucideIcon(icon, size: size == .xs ? 14 : 16) }
                Text(label).ui(fontSize, p.isGeist ? .medium : .semibold).lineLimit(1)
            }
            .foregroundStyle(fg)
            .padding(.horizontal, padding)
            .frame(height: height)
            .frame(maxWidth: block ? .infinity : nil)
            .background(bg, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous))
            .overlay { if let stroke { RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous).strokeBorder(stroke, lineWidth: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .disabled(disabled || busy)
        .opacity(disabled ? 0.5 : 1)
    }

    private var height: CGFloat {
        switch size {
        case .xs, .sm: return 40
        case .md: return 44
        case .lg: return p.isGeist ? 40 : 44
        }
    }
    private var padding: CGFloat {
        switch size {
        case .xs: return p.isGeist ? 8 : 10
        case .sm: return p.isGeist ? 10 : 12
        case .md: return p.isGeist ? 12 : 16
        case .lg: return 20
        }
    }
    private var fontSize: CGFloat {
        switch size {
        case .xs: return 12.5
        case .sm: return p.isGeist ? 13.5 : 13
        case .md: return 14
        case .lg: return p.isGeist ? 14 : 15
        }
    }
    private var colors: (Color, Color, Color?) {
        switch kind {
        case .go: return (p.primaryForeground, p.primary, nil)
        case .brand: return (p.brandForeground, p.brand, nil)
        case .soft: return p.isGeist ? (p.foreground, p.selected, nil) : (p.secondaryForeground, p.secondary, nil)
        case .ghost: return p.isGeist ? (p.mutedForeground, .clear, nil) : (p.foreground, p.dark ? p.input.opacity(0.3) : .clear, p.dark ? p.input : p.border)
        case .plain: return (p.isGeist ? p.foreground : p.brandInk, .clear, nil)
        case .danger: return (.white, p.dark && !p.isGeist ? p.danger.opacity(0.6) : p.danger, nil)
        case .dangerGhost: return (p.danger, .clear, nil)
        }
    }
}

/// Retour visuel au toucher (l'équivalent de `:active` / `hover:bg-accent`).
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.72 : 1)
    }
}

/// Rangée touchable : fond `accent` (Bbox Clair) ou `selected` (Noir Geist) pendant l'appui.
struct RowPressStyle: ButtonStyle {
    @Environment(\.palette) private var p
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? (p.isGeist ? p.selected : p.accent) : .clear,
                        in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 0, style: .continuous))
    }
}

/// Bouton icône (`IconBtn`) : 44 × 44 sur iPhone, icône 18 en gris.
struct IconBtn: View {
    var icon: String
    var label: String
    var size: CGFloat = 18
    var action: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        Button(action: action) {
            LucideIcon(icon, size: size).foregroundStyle(p.mutedForeground).frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(label)
    }
}

// MARK: - Interrupteurs

/// Interrupteur du kit (`Switch`) : 50 × 30 en Bbox Clair, 48 × 28 en Noir Geist sur iPhone.
struct KitSwitch: View {
    var isOn: Bool
    var disabled = false
    var label: String?
    var onChange: (Bool) -> Void
    @Environment(\.palette) private var p

    var body: some View {
        let w: CGFloat = p.isGeist ? 48 : 50, h: CGFloat = p.isGeist ? 28 : 30, thumb: CGFloat = p.isGeist ? 22 : 24
        Button { onChange(!isOn) } label: {
            ZStack(alignment: isOn ? .trailing : .leading) {
                Capsule().fill(isOn ? (p.isGeist ? p.foreground : p.brand) : p.foreground.opacity(0.16))
                Circle()
                    .fill(isOn && p.isGeist ? p.background : .white)
                    .shadow(color: p.isGeist ? .clear : .black.opacity(0.22), radius: 3, y: 2)
                    .frame(width: thumb, height: thumb)
                    .padding(3)
            }
            .frame(width: w, height: h)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
            .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.3), value: isOn)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.45 : 1)
        .accessibilityLabel(label ?? "")
        .accessibilityValue(isOn ? "activé" : "désactivé")
        .accessibilityAddTraits(.isToggle)
    }
}

/// Interrupteur relié à une écriture (`Toggle` du kit) : optimiste, revient en arrière si l'écriture échoue.
struct LiveToggle: View {
    var value: Bool
    var label: String?
    var disabled = false
    /// Confirmation avant le changement (nouvelle valeur → titre, message, bouton) ; `nil` = pas de question.
    var confirm: ((Bool) -> Confirm?)?
    var onChange: (Bool) async -> Bool
    @State private var shown: Bool?
    @State private var busy = false
    @State private var asking: (Bool, Confirm)?

    struct Confirm { var title: String; var message: String; var button: String; var destructive = true }

    var body: some View {
        KitSwitch(isOn: shown ?? value, disabled: disabled || busy, label: label) { nv in
            if let c = confirm?(nv) { asking = (nv, c) } else { flip(nv) }
        }
        .opacity(busy ? 0.7 : 1)
        .onChange(of: value) { _, _ in if !busy { shown = nil } }
        .alert(asking?.1.title ?? "", isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } })) {
            if let (nv, c) = asking {
                Button(c.button, role: c.destructive ? .destructive : nil) { flip(nv) }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text(asking?.1.message ?? "")
        }
    }

    private func flip(_ nv: Bool) {
        shown = nv
        busy = true
        Task {
            let ok = await onChange(nv)
            if !ok { shown = !nv }
            busy = false
            // garde la nouvelle position jusqu'à ce que le flux en direct la confirme
            if ok, value == nv { shown = nil }
        }
    }
}

/// Rangée avec interrupteur (`ToggleRow`).
struct ToggleRow: View {
    var title: String
    var sub: String?
    var value: Bool
    var disabled = false
    var first = false
    var confirm: ((Bool) -> LiveToggle.Confirm?)?
    var onChange: (Bool) async -> Bool
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).ui(p.isGeist ? 13.5 : 14.5, p.isGeist ? .medium : .semibold)
                if let sub { Text(sub).ui(p.isGeist ? 12.5 : 13).foregroundStyle(p.mutedForeground).fixedSize(horizontal: false, vertical: true) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            LiveToggle(value: value, label: title, disabled: disabled, confirm: confirm, onChange: onChange)
        }
        .frame(minHeight: p.isGeist ? 48 : 60)
        .padding(.vertical, p.isGeist ? 4 : 6)
        .overlay(alignment: .top) { if !first && !p.isGeist { Rectangle().fill(p.border).frame(height: 1) } }
    }
}

// MARK: - Contrôles segmentés et onglets

struct SegOption<V: Hashable>: Identifiable {
    var value: V
    var label: String
    var count: Int?
    var id: V { value }
}

/// Contrôle segmenté (`Seg`) : pastille qui glisse, défilement horizontal si trop large.
struct Seg<V: Hashable>: View {
    var options: [SegOption<V>]
    @Binding var value: V
    var small = false
    var block = false
    @Namespace private var ns
    @Environment(\.palette) private var p

    var body: some View {
        let content = HStack(spacing: p.isGeist ? 2 : 0) {
            ForEach(options) { o in
                let on = o.value == value
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.86)) { value = o.value }
                } label: {
                    HStack(spacing: 6) {
                        Text(o.label).ui(small ? 12.5 : (p.isGeist ? 13 : 13.5), .medium)
                        if let n = o.count { Text("\(n)").ui(11.5, .medium).foregroundStyle(p.mutedForeground) }
                    }
                    .foregroundStyle(on ? p.foreground : p.idleText)
                    .padding(.horizontal, small || p.isGeist ? 10 : 14)
                    .frame(height: 40)
                    .frame(maxWidth: block ? .infinity : nil)
                    .background {
                        if on {
                            RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 9, style: .continuous)
                                .fill(p.isGeist ? p.foreground.opacity(0.09) : p.card)
                                .shadow(color: p.isGeist ? .clear : .black.opacity(0.1), radius: 1.5, y: 1)
                                .matchedGeometryEffect(id: "seg", in: ns)
                        } else if block && p.isGeist {
                            RoundedRectangle(cornerRadius: p.radiusMD, style: .continuous).fill(p.field)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(p.isGeist ? 0 : 3)
        .background { if !p.isGeist { RoundedRectangle(cornerRadius: 12, style: .continuous).fill(p.secondary) } }

        if block {
            content.frame(maxWidth: .infinity)
        } else {
            ScrollView(.horizontal, showsIndicators: false) { content }.fixedSize(horizontal: false, vertical: true)
                .scrollClipDisabled(false)
        }
    }
}

/// Onglets de page (`Tabs`) : soulignement animé (Bbox Clair) ou pastille (Noir Geist).
struct PageTabs<V: Hashable>: View {
    var tabs: [SegOption<V>]
    @Binding var value: V
    @Namespace private var ns
    @Environment(\.palette) private var p

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: p.isGeist ? 2 : 4) {
                ForEach(tabs) { t in
                    let on = t.value == value
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { value = t.value }
                    } label: {
                        HStack(spacing: 8) {
                            Text(t.label).ui(p.isGeist ? 13 : 14, .medium)
                            if let n = t.count {
                                if p.isGeist {
                                    Text("\(n)").ui(12).foregroundStyle(p.mutedForeground)
                                } else {
                                    Text("\(n)").ui(11, .semibold).foregroundStyle(p.foreground)
                                        .padding(.horizontal, 6).frame(minWidth: 20, minHeight: 20).background(p.secondary, in: Capsule())
                                }
                            }
                        }
                        .foregroundStyle(on ? p.foreground : p.idleText)
                        .padding(.horizontal, p.isGeist ? 10 : 12)
                        .frame(height: p.isGeist ? 40 : 44)
                        .background {
                            if on && p.isGeist {
                                RoundedRectangle(cornerRadius: p.radiusMD, style: .continuous).fill(p.selected).matchedGeometryEffect(id: "tab", in: ns)
                            }
                        }
                        .overlay(alignment: .bottom) {
                            if on && !p.isGeist {
                                Capsule().fill(p.brand).frame(height: 2).padding(.horizontal, 8).matchedGeometryEffect(id: "tab", in: ns)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        // filet sous les onglets, dessiné derrière le soulignement de l'onglet actif
        .background(alignment: .bottom) { if !p.isGeist { Rectangle().fill(p.border).frame(height: 1) } }
        .padding(.bottom, p.isGeist ? 28 : 20)
    }
}

// MARK: - Rangées et avatars

/// Rangée de liste (`Row`) : 60 pt, filet au-dessus (sauf la première) en Bbox Clair ; 48 pt sans filet en Noir Geist.
struct Row<Content: View>: View {
    var first = false
    var minHeight: CGFloat?
    var spacing: CGFloat?
    var verticalPadding: CGFloat?
    var action: (() -> Void)?
    @ViewBuilder var content: Content
    @Environment(\.palette) private var p

    var body: some View {
        // `min-h` du web inclut le padding (border-box) : le padding passe donc avant la hauteur minimale
        let row = HStack(spacing: spacing ?? (p.isGeist ? 10 : 12)) { content }
            .padding(.vertical, verticalPadding ?? (p.isGeist ? 6 : 10))
            .frame(maxWidth: .infinity, minHeight: minHeight ?? (p.isGeist ? 48 : 60), alignment: .leading)
            .padding(.horizontal, p.isGeist ? 8 : 16)
            .contentShape(Rectangle())
        Group {
            if let action {
                Button(action: action) { row }.buttonStyle(RowPressStyle())
            } else {
                row
            }
        }
        .overlay(alignment: .top) { if !first && !p.isGeist { Rectangle().fill(p.border).frame(height: 1) } }
        .padding(.horizontal, p.isGeist ? -8 : 0)
    }
}

/// Avatar (`Avatar`) : tuile d'icône teintée avec pastille d'état.
struct Avatar: View {
    enum Size { case sm, md, lg }
    var icon: String
    var size: Size = .md
    var tone: Tone?
    var on: Bool?
    var paused = false
    @Environment(\.palette) private var p

    var body: some View {
        let (side, corner, glyph): (CGFloat, CGFloat, CGFloat) = switch (size, p.isGeist) {
        case (.sm, false): (36, 11, 16)
        case (.sm, true): (28, p.radiusMD, 15)
        case (.md, false): (40, p.radiusXL, 20)
        case (.md, true): (32, p.radiusMD, 17)
        case (.lg, false): (56, p.radius2XL, 28)
        case (.lg, true): (44, p.radius, 22)
        }
        let colors: (Color, Color) = {
            if let tone, tone != .neutral { let c = tone.colors(p); return (c.fg, c.bg) }
            return (p.avatarInk, p.isGeist ? p.selected : p.secondary)
        }()
        LucideIcon(icon, size: glyph)
            .foregroundStyle(colors.0)
            .frame(width: side, height: side)
            .background(colors.1, in: RoundedRectangle(cornerRadius: min(corner, side / 2), style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                if on != nil || paused {
                    let d: CGFloat = p.isGeist ? 10 : 12
                    Circle()
                        .fill(paused ? p.warn : on == true ? p.ok : p.mutedForeground.mix(p.card, 0.55))
                        .frame(width: d - 4, height: d - 4)
                        .padding(2)
                        .background(p.isGeist ? p.background : p.card, in: Circle())
                        .offset(x: 2, y: 2)
                }
            }
            .accessibilityHidden(true)
    }
}

/// Tuile compacte (`Tile`) : libellé, valeur, détail.
struct Tile: View {
    var label: String
    var value: String
    var extra: String?
    var horizontalPadding: CGFloat?
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).ui(12).foregroundStyle(p.mutedForeground).lineLimit(1)
            Text(value).ui(p.isGeist ? 17 : 16, p.isGeist ? .medium : .semibold, tracking: p.isGeist ? -0.02 : -0.01).lineLimit(1).minimumScaleFactor(0.8)
                .contentTransition(.numericText())
            if let extra { Text(extra).ui(12).foregroundStyle(p.mutedForeground).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, p.isGeist ? 0 : (horizontalPadding ?? 14))
        .padding(.vertical, p.isGeist ? 0 : 12)
        .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous).fill(p.surface) } }
    }
}

/// Valeur masquée avec boutons œil / copier (`Secret`).
struct Secret: View {
    var value: String
    @State private var show = false
    @State private var copied = false
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: 4) {
            Text(show ? (value.isEmpty ? "—" : value) : String(repeating: "•", count: min(16, value.isEmpty ? 10 : value.count)))
                .font(.custom("GeistMono-Regular", size: p.isGeist ? 13.5 : 15)).tracking(0.4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            IconBtn(icon: show ? "eyeoff" : "eye", label: show ? "Masquer" : "Afficher", size: 16) { show.toggle() }
            IconBtn(icon: copied ? "check" : "copy", label: "Copier", size: 16) {
                UIPasteboard.general.string = value
                copied = true
                Task { try? await Task.sleep(for: .seconds(1.5)); copied = false }
            }
        }
        .padding(.vertical, -4)
    }
}

// MARK: - Feuilles

/// En-tête de feuille (tiroir du web sur iPhone) : titre, description, bouton fermer.
struct SheetHeader<Trailing: View>: View {
    var title: String
    var description: String?
    @ViewBuilder var trailing: Trailing
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: p.isGeist ? 2 : 4) {
                Text(title).ui(p.isGeist ? 15 : 19, .semibold, tracking: p.isGeist ? -0.01 : -0.015).lineLimit(1)
                if let description { Text(description).ui(p.isGeist ? 12.5 : 14).foregroundStyle(p.mutedForeground).lineLimit(2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 4) {
                trailing
                IconBtn(icon: "x", label: "Fermer", size: p.isGeist ? 18 : 20) { dismiss() }
            }
            .padding(.trailing, -6).padding(.top, -4)
        }
        .padding(.horizontal, p.isGeist ? 16 : 20)
        .padding(.top, 8)
        .padding(.bottom, p.isGeist ? 8 : 12)
    }
}

extension SheetHeader where Trailing == EmptyView {
    init(title: String, description: String? = nil) { self.init(title: title, description: description) { EmptyView() } }
}

/// Présentation commune des feuilles : fond carte (Bbox Clair) ou verre (Noir Geist), coins 22 / 16.
struct KitSheet: ViewModifier {
    @Environment(\.palette) private var p
    func body(content: Content) -> some View {
        content
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(p.isGeist ? 16 : 22)
            .presentationBackground(p.isGeist ? AnyShapeStyle(p.popover) : AnyShapeStyle(p.card))
    }
}

extension View {
    func kitSheet() -> some View { modifier(KitSheet()) }
}

/// Feuille de choix (durées de pause, Wi-Fi invité) : cartes de choix (`Choices`).
struct Choices<V: Hashable>: View {
    var options: [SegOption<V>]
    var subs: [V: String] = [:]
    @Binding var value: V
    var columns = 3
    @Environment(\.palette) private var p

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: columns), spacing: 8) {
            ForEach(options) { o in
                let on = o.value == value
                Button { value = o.value } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(o.label).ui(p.isGeist ? 13.5 : 14, p.isGeist ? .medium : .semibold)
                        if let s = subs[o.value] {
                            Text(s).ui(p.isGeist ? 12 : 12.5).foregroundStyle(on && p.isGeist ? p.background.opacity(0.68) : p.mutedForeground)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: p.isGeist ? 48 : 56, alignment: .leading)
                    .padding(.horizontal, p.isGeist ? 12 : 14)
                    .foregroundStyle(on && p.isGeist ? p.background : p.foreground)
                    .background(on ? (p.isGeist ? p.foreground : p.brandSoft) : (p.isGeist ? p.field : p.card),
                                in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : p.radiusXL, style: .continuous))
                    .overlay {
                        if !p.isGeist {
                            RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous).strokeBorder(on ? p.brand : p.border, lineWidth: on ? 2 : 1)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if on && !p.isGeist {
                            LucideIcon("check", size: 12).foregroundStyle(p.brandForeground).frame(width: 18, height: 18).background(p.brand, in: Circle()).padding(10)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Divers

/// Barres de signal Wi-Fi (`SignalBars`) : 4 barres de 3 pt, hauteurs 6 à 15.
struct SignalBars: View {
    var bars: Int
    var color: Color?
    @Environment(\.palette) private var p

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(1...4, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1).fill(color ?? p.foreground).frame(width: 3, height: CGFloat(3 + i * 3)).opacity(i <= bars ? 1 : 0.2)
            }
        }
        .frame(height: 15, alignment: .bottom)
        .accessibilityLabel("Signal \(bars) sur 4")
    }
}

/// Mention à la place d'une fonction absente du mode courant (jamais présentée comme une erreur).
struct UnavailableNote: View {
    enum Reason { case relay, remote }
    var reason: Reason
    var detail: String?

    var body: some View {
        EmptyState(icon: reason == .relay ? "server" : "house", title: reason == .relay ? "Nécessite le relais" : "Indisponible à distance", text: detail)
    }
}

/// Image QR code générée localement (Core Image), sur fond blanc comme `QR` du kit.
struct QRTile: View {
    var text: String
    var size: CGFloat = 168
    var dim = false
    @Environment(\.palette) private var p

    var body: some View {
        QRCodeImage(text: text)
            .padding(12)
            .frame(width: size, height: size)
            .background(.white, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radius : p.radiusXL, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: p.isGeist ? p.radius : p.radiusXL, style: .continuous).strokeBorder(p.border, lineWidth: 1))
            .opacity(dim ? 0.2 : 1)
            .blur(radius: dim ? 1 : 0)
            .grayscale(dim ? 1 : 0)
    }
}
