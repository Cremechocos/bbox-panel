import SwiftUI

@main
struct PanelBboxApp: App {
    @State private var connection = ConnectionManager()
    @State private var appearance = Appearance()

    init() { Palette.registerFonts() }

    /// Tests unitaires hébergés : pas de recherche réseau au lancement.
    private var isTesting: Bool { ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(connection)
                .modifier(ThemedRoot(appearance: appearance))
                .task {
                    if !isTesting { connection.connect() }
                }
                // lien de jumelage bboxpanel://pair?url=… (QR code du panel web)
                .onOpenURL { url in
                    Task {
                        do { try await connection.pair(with: url) } catch { connection.notice = (error as? LocalizedError)?.errorDescription }
                    }
                }
        }
    }
}

struct RootView: View {
    @Environment(ConnectionManager.self) private var connection
    @Environment(Appearance.self) private var appearance
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch connection.phase {
            case .searching(let message):
                SearchingView(message: message)
            case .login(let target):
                LoginView(target: target)
            case .unreachable:
                UnreachableView()
            case .connected(let store):
                Shell(store: store)
            }
        }
        .animation(.default, value: phaseKey)
        // édition perso : Bouygues Read est téléchargée une fois depuis la Bbox (ou le relais), puis gardée en cache
        .task(id: connection.target?.url) {
            if Edition.isPerso, appearance.brandFamily == nil, let target = connection.target {
                appearance.brandFamily = await BrandFont.download(from: target)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            // iOS coupe les connexions en arrière-plan : on arrête le flux et on le relance au retour
            guard case .connected(let store) = connection.phase else { return }
            if phase == .active { store.start() } else if phase == .background { store.stop() }
        }
    }

    private var phaseKey: String {
        switch connection.phase {
        case .searching: return "searching"
        case .login: return "login"
        case .unreachable: return "unreachable"
        case .connected: return "connected"
        }
    }
}
