import SwiftUI
import CoreText

/// Deux éditions de l'app, choisies à la compilation :
/// - **Perso** (schéma « PanelBbox Perso », condition `PERSO`) : nom « Ma Bbox », logo Bouygues Telecom
///   et police Bouygues Read, à l'identique du panel web. Rien de la marque n'est embarqué hormis le tracé du
///   logo : la police est téléchargée depuis la Bbox (ou le relais) au premier lancement.
/// - **App Store** : nom neutre « Panel pour Bbox », logo générique, police système (règle 5.2.1).
enum Edition {
    #if PERSO
    static let isPerso = true
    static let appName = "Ma Bbox"
    #else
    static let isPerso = false
    static let appName = "Panel pour Bbox"
    #endif
}

/// Logo de l'app : Bouygues Telecom (édition perso), routeur Lucide sinon.
struct BrandLogo: View {
    var size: CGFloat
    var color: Color

    var body: some View {
        #if PERSO
        BytelShape().fill(color).frame(width: size, height: size).accessibilityLabel("Bouygues Telecom")
        #else
        LucideIcon("router", size: size * 0.86).foregroundStyle(color).frame(width: size, height: size).accessibilityHidden(true)
        #endif
    }
}

#if PERSO
/// Tracé du logo Bouygues Telecom repris de `web/src/components/icon.tsx` (repère 48 × 48).
struct BytelShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 48
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * s, y: rect.minY + y * s) }
        var path = Path()
        // ovale du haut
        path.move(to: p(23.9972, 19.2412))
        path.addCurve(to: p(38.3748, 12.6206), control1: p(31.9373, 19.2412), control2: p(38.3748, 16.2761))
        path.addCurve(to: p(23.9972, 6), control1: p(38.3748, 8.96419), control2: p(31.9373, 6))
        path.addCurve(to: p(9.61958, 12.6206), control1: p(16.0571, 6), control2: p(9.61958, 8.96419))
        path.addCurve(to: p(23.9972, 19.2412), control1: p(9.61958, 16.2761), control2: p(16.0571, 19.2412))
        path.closeSubpath()
        // pétale gauche
        path.move(to: p(20.0974, 40.5885))
        path.addCurve(to: p(6.27063, 32.9846), control1: p(16.9691, 42.669), control2: p(10.7771, 39.2701))
        path.addCurve(to: p(3.77476, 17.8448), control1: p(1.76315, 26.6991), control2: p(0.645473, 19.9243))
        path.addCurve(to: p(17.4464, 25.2754), control1: p(6.90405, 15.7643), control2: p(12.9389, 18.9889))
        path.addCurve(to: p(20.0974, 40.5885), control1: p(21.9539, 31.5599), control2: p(23.2257, 38.508))
        path.closeSubpath()
        // pétale droit
        path.move(to: p(27.9024, 40.5885))
        path.addCurve(to: p(30.5534, 25.2754), control1: p(24.7741, 38.508), control2: p(26.0459, 31.5599))
        path.addCurve(to: p(44.226, 17.8448), control1: p(35.0609, 18.9889), control2: p(41.0957, 15.7643))
        path.addCurve(to: p(41.7291, 32.9846), control1: p(47.3543, 19.9243), control2: p(46.2366, 26.6991))
        path.addCurve(to: p(27.9024, 40.5885), control1: p(37.2226, 39.2701), control2: p(31.0307, 42.669))
        path.closeSubpath()
        return path
    }
}
#endif

/// Police Bouygues Read de Bbox Clair (édition perso seulement).
///
/// La Bbox sert elle-même ses polices (`/fonts/BouyguesRead-*.woff2`) ; le relais les relaie à la même adresse
/// (`handleFont` de server/index.mjs). On les télécharge une fois, on les garde dans Application Support et on
/// les enregistre pour l'app : Core Text lit le WOFF2 directement.
enum BrandFont {
    static let files = ["BouyguesRead-Regular", "BouyguesRead-Semibold"]

    private static var folder: URL? {
        try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("Fonts", isDirectory: true)
    }

    /// Enregistre les fichiers déjà téléchargés. Renvoie le nom de famille, ou `nil` s'ils manquent.
    @discardableResult
    static func registerCached() -> String? {
        #if PERSO
        guard let folder else { return nil }
        var family: String?
        for name in files {
            let url = folder.appendingPathComponent(name + ".woff2")
            guard FileManager.default.fileExists(atPath: url.path) else { return nil }
            if let f = register(url) { family = family ?? f }
        }
        return family
        #else
        return nil
        #endif
    }

    /// Télécharge les polices depuis l'origine connectée (relais ou Bbox) si elles manquent.
    static func download(from target: Target) async -> String? {
        #if PERSO
        if let family = registerCached() { return family }
        guard let folder else { return nil }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let session = HTTP.makeSession(timeout: 15, delegate: target.isRelay ? nil : BboxTLSDelegate())
        defer { session.finishTasksAndInvalidate() }
        for name in files {
            var request = URLRequest(url: target.url.appendingPathComponent("fonts/\(name).woff2"))
            request.cachePolicy = .reloadIgnoringLocalCacheData
            guard let (data, response) = try? await HTTP.send(session, request), response.statusCode == 200,
                  data.starts(with: Data("wOF2".utf8)) else { return nil }
            try? data.write(to: folder.appendingPathComponent(name + ".woff2"), options: .atomic)
        }
        return registerCached()
        #else
        return nil
        #endif
    }

    private static func register(_ url: URL) -> String? {
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let first = descriptors.first else { return nil }
        // déjà enregistrée (second appel) : l'erreur est attendue, la police reste utilisable
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        return CTFontDescriptorCopyAttribute(first, kCTFontFamilyNameAttribute) as? String
    }
}
