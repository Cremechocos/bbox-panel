import SwiftUI

/// Relais (saisie, recherche, QR code) et accès distant de la Bbox.
struct ConnectionSettingsView: View {
    @Environment(ConnectionManager.self) private var connection
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var palette
    @State private var relayText = ""
    @State private var remoteHost = ""
    @State private var remotePort = "443"
    @State private var busy: String?
    @State private var message: (text: String, ok: Bool)?
    @State private var showScanner = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("192.168.1.42:8484", text: $relayText)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button { Task { await useTypedRelay() } } label: { rowLabel("Utiliser ce relais", "checkmark.circle", busy == "relay") }
                        .disabled(relayText.trimmingCharacters(in: .whitespaces).isEmpty || busy != nil)
                    Button { Task { await scan() } } label: { rowLabel("Rechercher sur le réseau", "magnifyingglass", busy == "scan") }
                        .disabled(busy != nil)
                    Button { showScanner = true } label: { Label("Scanner le QR code de jumelage", systemImage: "qrcode.viewfinder") }
                        .disabled(busy != nil)
                } header: {
                    Group {
                        Text("Relais du panel")
                    }.sectionHeaderFont()
                } footer: {
                    Group {
                        Text("Le QR code s’affiche dans le panel web, rubrique Ma Bbox → App mobile. Avec le relais, l’app gagne le temps réel, l’historique, les évènements et les minuteurs.")
                    }.sectionFooterFont()
                }
                .themedRows()

                if connection.settings.relayLocal != nil || connection.settings.relayRemote != nil {
                    Section {
                        if let url = connection.settings.relayLocal { LabeledContent("Maison", value: url.absoluteString) }
                        if let url = connection.settings.relayRemote { LabeledContent("À distance", value: url.absoluteString) }
                        Button("Oublier les relais et passer en direct", role: .destructive) {
                            connection.forgetRelays()
                            dismiss()
                        }
                    } header: {
                        Group {
                            Text("Relais enregistrés")
                        }.sectionHeaderFont()
                    }
                    .themedRows()
                }

                Section {
                    TextField("IP publique ou nom DynDNS", text: $remoteHost)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Port", text: $remotePort)
                        .keyboardType(.numberPad)
                    Button("Enregistrer l’accès distant") { saveRemote() }
                        .disabled(busy != nil)
                } header: {
                    Group {
                        Text("Accès distant de la Bbox")
                    }.sectionHeaderFont()
                } footer: {
                    Group {
                        Text("À activer dans l’interface de la Bbox (Accès & sécurité → Administration à distance). Utilisé hors de la maison quand aucun relais ne répond. Certaines fonctions y sont refusées par la Bbox.")
                    }.sectionFooterFont()
                }
                .themedRows()

                if let message {
                    Section {
                        Label(message.text, systemImage: message.ok ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                            .foregroundStyle(message.ok ? palette.ok : palette.danger)
                    }
                    .themedRows()
                }
            }
            .themedList()
            .navigationTitle("Connexion")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } }
            }
            .onAppear {
                remoteHost = connection.settings.remoteHost
                remotePort = String(connection.settings.remotePort)
            }
            .sheet(isPresented: $showScanner) {
                QRScannerSheet { code in
                    showScanner = false
                    Task { await pair(code) }
                }
            }
        }
    }

    private func rowLabel(_ title: String, _ symbol: String, _ running: Bool) -> some View {
        HStack {
            Label(title, systemImage: symbol)
            Spacer()
            if running { ProgressView() }
        }
    }

    private func useTypedRelay() async {
        guard let url = Discovery.relayOrigin(from: relayText) else { message = ("Adresse invalide.", false); return }
        busy = "relay"
        defer { busy = nil }
        do {
            try await connection.useRelay(url)
            dismiss()
        } catch {
            message = ((error as? LocalizedError)?.errorDescription ?? "Relais injoignable.", false)
        }
    }

    private func scan() async {
        busy = "scan"
        defer { busy = nil }
        message = nil
        if let url = await Discovery.scanForRelay() {
            relayText = url.absoluteString
            message = ("Relais trouvé : \(url.host ?? url.absoluteString)", true)
            try? await connection.useRelay(url)
            dismiss()
        } else {
            message = ("Aucun relais trouvé sur ce réseau (port \(Discovery.relayPort)).", false)
        }
    }

    private func pair(_ code: String) async {
        guard let url = URL(string: code) else { message = ("QR code non reconnu.", false); return }
        busy = "relay"
        defer { busy = nil }
        do {
            try await connection.pair(with: url)
            dismiss()
        } catch {
            message = ((error as? LocalizedError)?.errorDescription ?? "QR code non reconnu.", false)
        }
    }

    private func saveRemote() {
        let host = remoteHost.trimmingCharacters(in: .whitespaces)
        let port = Int(remotePort.trimmingCharacters(in: .whitespaces)) ?? 0
        guard host.isEmpty || (1...65535).contains(port) else { message = ("Port invalide (1 à 65535).", false); return }
        connection.settings.remoteHost = host
        connection.settings.remotePort = port == 0 ? 443 : port
        message = (host.isEmpty ? "Accès distant retiré." : "Accès distant enregistré.", true)
    }
}
