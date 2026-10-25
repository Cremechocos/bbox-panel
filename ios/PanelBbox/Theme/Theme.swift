import SwiftUI
import CoreText

/// Apparences du panel web (`web/src/lib/theme.ts`), avec les mêmes couleurs (`web/src/index.css`).
enum Skin: String, CaseIterable, Identifiable {
    case clair, geist

    var id: String { rawValue }
    var name: String { self == .clair ? "Bbox Clair" : "Noir Geist" }
    var summary: String {
        self == .clair ? "Lumineux et doux, des cartes sur fond bleu-gris."
                       : "Noir profond, minimal et dense : des listes et des chiffres, sans cartes."
    }
    /// Mode par défaut de l'apparence, comme sur le web.
    var defaultPref: ThemePref { self == .clair ? .light : .dark }
}

enum ThemePref: String, CaseIterable, Identifiable {
    case auto, light, dark

    var id: String { rawValue }
    var label: String {
        switch self {
        case .auto: return "Auto"
        case .light: return "Clair"
        case .dark: return "Sombre"
        }
    }
    var scheme: ColorScheme? {
        switch self {
        case .auto: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Choix d'apparence, mémorisé sur cet appareil avec les mêmes clés que le web (`skin`, `theme.<skin>`).
@Observable @MainActor
final class Appearance {
    private let defaults: UserDefaults

    var skin: Skin { didSet { defaults.set(skin.rawValue, forKey: "skin") } }
    /// Mode clair/sombre de l'apparence courante (chaque apparence garde le sien).
    var pref: ThemePref {
        didSet { defaults.set(pref.rawValue, forKey: "theme." + skin.rawValue) }
    }

    /// Famille de Bouygues Read une fois téléchargée (édition perso) ; police système sinon.
    var brandFamily: String? = BrandFont.registerCached()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let skin = Skin(rawValue: defaults.string(forKey: "skin") ?? "") ?? .clair
        self.skin = skin
        self.pref = Self.storedPref(for: skin, in: defaults)
    }

    func select(_ skin: Skin) {
        self.skin = skin
        pref = Self.storedPref(for: skin, in: defaults)
    }

    private static func storedPref(for skin: Skin, in defaults: UserDefaults) -> ThemePref {
        ThemePref(rawValue: defaults.string(forKey: "theme." + skin.rawValue) ?? "") ?? skin.defaultPref
    }
}

/// Jetons de couleur d'une apparence dans un mode (noms des variables CSS du web).
struct Palette {
    var skin: Skin
    var dark: Bool
    /// Bouygues Read (Bbox Clair, édition perso), sinon police système.
    var brandFamily: String?

    var background, foreground, card, cardBorder, secondary, mutedForeground, faint: Color
    var border, field, selected: Color
    var brand, brandForeground, brandSoft, brandInk: Color
    var ok, okSoft, warn, warnSoft, danger, dangerSoft: Color
    var down, up, lat: Color
    var primary, primaryForeground, accent, surface, muted, popover, input, hover, logo, chart3, chart4, chart5: Color
    var glass, glassRing: Color

    /// `--radius` du web : 14 px (Bbox Clair), 8 px (Noir Geist).
    var radius: CGFloat { skin == .clair ? 14 : 8 }
    /// Noir Geist n'a pas de cartes : des sections sur le fond.
    var hasCards: Bool { skin == .clair }

    init(skin: Skin, dark: Bool, brandFamily: String? = nil) {
        self.skin = skin
        self.dark = dark
        self.brandFamily = brandFamily
        switch (skin, dark) {
        case (.clair, false):
            background = Color(hex: 0xeef2f5); foreground = Color(hex: 0x132331); card = .white; cardBorder = .clear
            secondary = Color(hex: 0xe6edf2); mutedForeground = Color(hex: 0x5a6d7e); faint = Color(hex: 0x7d8e9c)
            border = Color(hex: 0xdfe6ec); field = Color(hex: 0xf4f7f9); selected = Color(hex: 0x132331, alpha: 0.06)
            brand = Color(hex: 0x0c7b91); brandForeground = .white; brandSoft = Color(hex: 0xe1f1f4); brandInk = Color(hex: 0x08606f)
            ok = Color(hex: 0x00704b); okSoft = Color(hex: 0xe2f3eb); warn = Color(hex: 0x9a4307); warnSoft = Color(hex: 0xfdeee2)
            danger = Color(hex: 0xc4290a); dangerSoft = Color(hex: 0xfde9e4)
            down = Color(hex: 0x0c7b91); up = Color(hex: 0x25465f); lat = Color(hex: 0x3a72d0)
            primary = Color(hex: 0x182b3b); primaryForeground = .white; accent = Color(hex: 0xe9f0f4); surface = Color(hex: 0xf4f7f9); muted = Color(hex: 0xeef2f5)
            popover = .white; input = Color(hex: 0xd3dde5); hover = Color(hex: 0x132331, alpha: 0.04); logo = Color(hex: 0x25465f)
            chart3 = Color(hex: 0x3ab3c8); chart4 = Color(hex: 0xe08a2e); chart5 = Color(hex: 0x9fb3c3); glass = Color(hex: 0xffffff, alpha: 0.86); glassRing = Color(hex: 0x132331, alpha: 0.08)
        case (.clair, true):
            background = Color(hex: 0x0b1620); foreground = Color(hex: 0xe7eef4); card = Color(hex: 0x112231); cardBorder = Color(hex: 0xe7eef4, alpha: 0.06)
            secondary = Color(hex: 0x1a2f41); mutedForeground = Color(hex: 0x93a7b8); faint = Color(hex: 0x6f8496)
            border = Color(hex: 0xe7eef4, alpha: 0.09); field = Color(hex: 0x0f1e2b); selected = Color(hex: 0xe7eef4, alpha: 0.07)
            brand = Color(hex: 0x4cc0d4); brandForeground = Color(hex: 0x04161c); brandSoft = Color(hex: 0x4cc0d4, alpha: 0.14); brandInk = Color(hex: 0x7fd6e6)
            ok = Color(hex: 0x4fd09d); okSoft = Color(hex: 0x4fd09d, alpha: 0.13); warn = Color(hex: 0xffb071); warnSoft = Color(hex: 0xffb071, alpha: 0.13)
            danger = Color(hex: 0xff8a70); dangerSoft = Color(hex: 0xff8a70, alpha: 0.13)
            down = Color(hex: 0x4cc0d4); up = Color(hex: 0x8fb1cc); lat = Color(hex: 0x7ea6f6)
            primary = Color(hex: 0xe7eef4); primaryForeground = Color(hex: 0x0b1620); accent = Color(hex: 0x1a2f41); surface = Color(hex: 0x0f1e2b); muted = Color(hex: 0x152839)
            popover = Color(hex: 0x132636); input = Color(hex: 0xe7eef4, alpha: 0.14); hover = Color(hex: 0xe7eef4, alpha: 0.04); logo = Color(hex: 0xe7eef4)
            chart3 = Color(hex: 0x6fd3e3); chart4 = Color(hex: 0xf0a35c); chart5 = Color(hex: 0x5b7385); glass = Color(hex: 0x112231, alpha: 0.86); glassRing = Color(hex: 0xe7eef4, alpha: 0.08)
        case (.geist, false):
            background = .white; foreground = Color(hex: 0x17181a); card = .white; cardBorder = .clear
            secondary = Color(hex: 0xf1f1f2); mutedForeground = Color(hex: 0x6b6e75); faint = Color(hex: 0x707379)
            border = Color(hex: 0x000000, alpha: 0.07); field = Color(hex: 0x000000, alpha: 0.04); selected = Color(hex: 0x000000, alpha: 0.055)
            brand = Color(hex: 0x17181a); brandForeground = .white; brandSoft = Color(hex: 0x000000, alpha: 0.05); brandInk = Color(hex: 0x17181a)
            ok = Color(hex: 0x17784b); okSoft = Color(hex: 0x17784b, alpha: 0.1); warn = Color(hex: 0xa04d00); warnSoft = Color(hex: 0xd97706, alpha: 0.12)
            danger = Color(hex: 0xc93636); dangerSoft = Color(hex: 0xc93636, alpha: 0.09)
            down = Color(hex: 0x0a84ff); up = Color(hex: 0xa550dd); lat = Color(hex: 0x24a36b)
            primary = Color(hex: 0x17181a); primaryForeground = .white; accent = Color(hex: 0xefeff0); surface = Color(hex: 0xf6f6f7); muted = Color(hex: 0xf4f4f5)
            popover = .white; input = Color(hex: 0x000000, alpha: 0.1); hover = Color(hex: 0x000000, alpha: 0.035); logo = Color(hex: 0x17181a)
            chart3 = Color(hex: 0x24a36b); chart4 = Color(hex: 0xe08a00); chart5 = Color(hex: 0xa6a8ad); glass = Color(hex: 0xffffff, alpha: 0.84); glassRing = Color(hex: 0x000000, alpha: 0.08)
        case (.geist, true):
            background = Color(hex: 0x08090a); foreground = Color(hex: 0xf7f8f8); card = Color(hex: 0x0f1011); cardBorder = .clear
            secondary = Color(hex: 0x17181a); mutedForeground = Color(hex: 0x8a8f98); faint = Color(hex: 0x7b7f87)
            border = Color(hex: 0xffffff, alpha: 0.07); field = Color(hex: 0xffffff, alpha: 0.045); selected = Color(hex: 0xffffff, alpha: 0.06)
            brand = Color(hex: 0xf7f8f8); brandForeground = Color(hex: 0x08090a); brandSoft = Color(hex: 0xffffff, alpha: 0.07); brandInk = Color(hex: 0xf7f8f8)
            ok = Color(hex: 0x4cb782); okSoft = Color(hex: 0x4cb782, alpha: 0.13); warn = Color(hex: 0xf2a33a); warnSoft = Color(hex: 0xf2a33a, alpha: 0.13)
            danger = Color(hex: 0xeb5757); dangerSoft = Color(hex: 0xeb5757, alpha: 0.13)
            down = Color(hex: 0x5ac8fa); up = Color(hex: 0xbf5af2); lat = Color(hex: 0x4cb782)
            primary = Color(hex: 0xf7f8f8); primaryForeground = Color(hex: 0x08090a); accent = Color(hex: 0x17181a); surface = Color(hex: 0x0f1011); muted = Color(hex: 0x121314)
            popover = Color(hex: 0x141517); input = Color(hex: 0xffffff, alpha: 0.1); hover = Color(hex: 0xffffff, alpha: 0.035); logo = Color(hex: 0xf7f8f8)
            chart3 = Color(hex: 0x4cb782); chart4 = Color(hex: 0xf2a33a); chart5 = Color(hex: 0x62666d); glass = Color(hex: 0x161719, alpha: 0.8); glassRing = Color(hex: 0xffffff, alpha: 0.07)
        }
    }

    /// Fond des rangées de liste : la carte en Bbox Clair, le fond lui-même en Noir Geist.
    var rowBackground: Color { hasCards ? card : background }

    // MARK: Polices

    /// Noir Geist utilise Geist (licence OFL, embarquée). Bbox Clair utilise Bouygues Read comme le web dans
    /// l'édition perso (téléchargée depuis la Bbox, voir `BrandFont`), la police système dans l'édition App Store.
    func font(_ style: Font.TextStyle, _ weight: Font.Weight? = nil) -> Font {
        guard skin == .geist else {
            if let brandFamily { return Font.custom(brandFamily, size: Self.size(of: style), relativeTo: style).weight(weight ?? .regular) }
            return weight.map { Font.system(style).weight($0) } ?? .system(style)
        }
        let base = Font.custom("Geist", size: Self.size(of: style), relativeTo: style)
        return base.weight(weight ?? (style == .headline ? .semibold : .regular))
    }

    /// Taille en px du web (1 px CSS = 1 pt sur iPhone).
    func font(size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        if skin == .geist { return Font.custom("Geist", size: size).weight(weight) }
        if let brandFamily { return Font.custom(brandFamily, size: size).weight(weight) }
        return .system(size: size, weight: weight)
    }

    /// Adresses IP et MAC : Geist Mono, comme `font-mono` sur le web (les deux apparences).
    func mono(_ style: Font.TextStyle = .body) -> Font {
        Font.custom("GeistMono-Regular", size: Self.size(of: style), relativeTo: style)
    }

    private static func size(of style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: return 34
        case .title: return 28
        case .title2: return 22
        case .title3: return 20
        case .headline, .body: return 17
        case .callout: return 16
        case .subheadline: return 15
        case .footnote: return 13
        case .caption: return 12
        case .caption2: return 11
        default: return 17
        }
    }

    /// Enregistre Geist et Geist Mono pour l'app (WOFF2 lus directement par Core Text).
    static func registerFonts() {
        for name in ["Geist-Variable", "GeistMono-Variable"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "woff2") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255,
                  blue: Double(hex & 0xff) / 255, opacity: alpha)
    }
}

private struct PaletteKey: EnvironmentKey {
    static let defaultValue = Palette(skin: .clair, dark: false)
}

extension EnvironmentValues {
    var palette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}

/// Police de l'apparence courante, à la place de `.font(.footnote)` & co.
private struct AppFont: ViewModifier {
    @Environment(\.palette) private var palette
    var style: Font.TextStyle?
    var size: CGFloat?
    var weight: Font.Weight?

    func body(content: Content) -> some View {
        if let size {
            content.font(palette.font(size: size, weight ?? .regular))
        } else {
            content.font(palette.font(style ?? .body, weight))
        }
    }
}

private struct MonoFont: ViewModifier {
    @Environment(\.palette) private var palette
    var style: Font.TextStyle
    func body(content: Content) -> some View { content.font(palette.mono(style)) }
}

extension View {
    func appFont(_ style: Font.TextStyle, _ weight: Font.Weight? = nil) -> some View {
        modifier(AppFont(style: style, weight: weight))
    }

    func appFont(size: CGFloat, _ weight: Font.Weight = .regular) -> some View {
        modifier(AppFont(size: size, weight: weight))
    }

    func monoFont(_ style: Font.TextStyle = .body) -> some View { modifier(MonoFont(style: style)) }

    /// En-tête de section : natif en Bbox Clair, petit titre Geist semi-gras en Noir Geist (13,5 px sur le web).
    func sectionHeaderFont() -> some View { modifier(SectionText(header: true)) }
    func sectionFooterFont() -> some View { modifier(SectionText(header: false)) }

    /// Écran en liste sur le fond de l'apparence.
    func themedList() -> some View { modifier(ThemedList()) }

    /// Rangées d'une section de liste : fond de carte (Bbox Clair) ou rien (Noir Geist), séparateurs.
    func themedRows() -> some View { modifier(ThemedRows()) }
}

private struct SectionText: ViewModifier {
    @Environment(\.palette) private var palette
    var header: Bool

    func body(content: Content) -> some View {
        if palette.skin == .geist {
            content
                .font(header ? Font.custom("Geist", size: 14, relativeTo: .footnote).weight(.semibold) : palette.font(.footnote))
                .foregroundStyle(header ? palette.foreground : palette.mutedForeground)
        } else {
            content
        }
    }
}

private struct ThemedList: ViewModifier {
    @Environment(\.palette) private var palette
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(palette.background)
    }
}

private struct ThemedRows: ViewModifier {
    @Environment(\.palette) private var palette
    func body(content: Content) -> some View {
        content
            .listRowBackground(palette.rowBackground)
            .listRowSeparatorTint(palette.border)
            .listRowSeparator(palette.hasCards ? .automatic : .hidden)
            .listSectionSeparator(.hidden)
    }
}

/// Applique l'apparence à tout l'arbre : mode, palette, teinte, police, styles primaire/secondaire.
struct ThemedRoot: ViewModifier {
    var appearance: Appearance
    @Environment(\.colorScheme) private var systemScheme

    func body(content: Content) -> some View {
        let dark = (appearance.pref.scheme ?? systemScheme) == .dark
        let palette = Palette(skin: appearance.skin, dark: dark, brandFamily: appearance.brandFamily)
        content
            .environment(\.palette, palette)
            .environment(appearance)
            .tint(palette.brand)
            // Bbox Clair garde les polices système par défaut (en-têtes et pieds de section compris)
            .font(palette.skin == .geist || palette.brandFamily != nil ? palette.font(size: 16) : nil)
            // `.secondary` vaut alors `--muted-foreground`, `.tertiary` `--faint`
            .foregroundStyle(palette.foreground, palette.mutedForeground, palette.faint)
            .preferredColorScheme(appearance.pref.scheme)
            .onAppear { Self.styleBars(appearance.skin) }
            .onChange(of: appearance.skin) { _, skin in Self.styleBars(skin) }
    }

    /// Titres des barres de navigation (UIKit) : Geist en Noir Geist, police système sinon.
    /// S'applique aux barres créées ensuite (écrans ouverts après le changement).
    private static func styleBars(_ skin: Skin) {
        let bar = UINavigationBar.appearance()
        guard skin == .geist, let large = UIFont(name: "Geist-SemiBold", size: 34), let small = UIFont(name: "Geist-SemiBold", size: 17) else {
            bar.largeTitleTextAttributes = nil
            bar.titleTextAttributes = nil
            return
        }
        bar.largeTitleTextAttributes = [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: large)]
        bar.titleTextAttributes = [.font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: small)]
    }
}
