import SwiftUI

/// Wi-Fi (`views/wifi.tsx`, version iPhone) : réseaux et QR codes, interrupteurs, bandes radio.
struct WifiScreen: View {
    var store: PanelStore
    @State private var sheet: Sheet?
    @Environment(\.palette) private var p

    enum Sheet: Identifiable { case guest, edit(path: String, title: String, ssid: JSON, canHide: Bool, main: Bool)
        var id: String { switch self { case .guest: "guest"; case .edit(let path, _, _, _, _): path } }
    }

    private static let proto = ["WPA2-WPA3": "WPA2/WPA3", "WPA3": "WPA3", "WPA2": "WPA2", "WPA-WPA2": "WPA/WPA2", "None": "Ouvert"]
    private static let bandList: [(k: String, l: String)] = [("24", "2,4 GHz"), ("5", "5 GHz"), ("6", "6 GHz")]

    var body: some View {
        let w = store.w
        Page(title: "Wi-Fi", refresh: { await store.refresh() }) {
            if w.isNull {
                PageHead(kicker: "Sans fil", title: "Wi-Fi")
                if store.loaded {
                    Card { EmptyState(icon: "alert", title: "Wi-Fi indisponible", text: "La Bbox n’a pas renvoyé la configuration Wi-Fi.") }
                } else {
                    LoadingPlaceholder()
                }
            } else {
                content(w)
            }
        }
        .sheet(item: $sheet) { s in
            Group {
                switch s {
                case .guest: GuestSheet(store: store)
                case let .edit(path, title, ssid, canHide, main): WifiEditSheet(store: store, path: path, title: title, ssid: ssid, canHide: canHide, main: main)
                }
            }
            .kitSheet()
        }
    }

    private func count(_ active: [Host], _ pattern: String) -> Int { active.filter { $0.link.range(of: pattern, options: .regularExpression) != nil }.count }

    @ViewBuilder private func content(_ w: JSON) -> some View {
        let main = w["ssid"]["24"], mlo = w["ssid"]["mlo"], guest = w["ssid"]["guest"]
        let radioOn = w["radio"]["24"]["enable"].int == 1
        let unified = w["unified"].int == 1
        let active = store.hosts.filter(\.active)
        let eco = w["radio"]["5"]["ecoMode"]["enable"].int == 1 || w["radio"]["6"]["ecoMode"]["enable"].int == 1
        let bands = Self.bandList.filter { !w["radio"][$0.k].isNull }

        PageHead(kicker: "Sans fil", title: "Wi-Fi", sub: unified ? "Un seul nom de réseau pour les bandes 2,4, 5 et 6 GHz" : "Bandes séparées") {
            WifiPill(on: radioOn)
        }

        VStack(spacing: 12) {
            NetworkCard(title: "Réseau principal", icon: "wifi", ssid: main["id"].string ?? "", pass: main["security"]["passphrase"].string,
                        proto: main["security"]["protocol"].string,
                        chips: [unified ? "2,4 · 5 · 6 GHz" : "2,4 GHz", "\(active.filter { !$0.isEthernet }.count) appareils sans fil"],
                        hidden: main["hidden"].int == 1) {
                sheet = .edit(path: "wireless/24", title: "Réseau principal", ssid: main, canHide: false, main: true)
            }

            Card("Interrupteurs", icon: "sliders") {
                VStack(spacing: 0) {
                    ToggleRow(title: "Wi-Fi", sub: "Toutes les bandes du réseau principal", value: radioOn, first: true, confirm: { nv in
                        nv ? nil : .init(title: "Couper tout le Wi-Fi ?", message: "Tous les appareils sans fil seront déconnectés, y compris celui-ci s’il est en Wi-Fi. Pour le rallumer, il faudra un appareil en Ethernet ou le bouton Wi-Fi de la Bbox.", button: "Couper le Wi-Fi")
                    }) { await store.setWifi($0) }
                    ToggleRow(title: "Unifier les bandes", sub: "Un seul nom et mot de passe pour toutes les bandes", value: unified, confirm: { nv in
                        .init(title: nv ? "Unifier les réseaux Wi-Fi ?" : "Séparer les bandes ?",
                              message: nv ? "Les bandes 2,4, 5 et 6 GHz prendront le nom et le mot de passe du réseau 2,4 GHz. Les appareils se reconnecteront." : "Chaque bande aura son propre nom de réseau. Les appareils se reconnecteront.",
                              button: nv ? "Unifier" : "Séparer", destructive: false)
                    }) { nv in await store.writeWireless("wireless/5", ["unified": .bool(nv)], ok: nv ? "Réseaux unifiés" : "Bandes séparées") }
                    ToggleRow(title: "Mode éco Wi-Fi", sub: "Réduit la puissance 5 et 6 GHz quand le réseau est calme", value: eco) { nv in
                        await store.run(nv ? "Mode éco activé" : "Mode éco désactivé", refresh: ["wireless"]) { [backend = store.backend] in
                            try await backend.write(.put, "wireless/5", ["ecoMode": .bool(nv)])
                            if !w["radio"]["6"].isNull { try await backend.write(.put, "wireless/6", ["ecoMode": .bool(nv)]) }
                        }
                    }
                    ToggleRow(title: "WPS", sub: "Appairage par bouton", value: main["wps"]["enable"].int == 1) { nv in
                        await store.writeWireless("wireless", ["wps.enable": .bool(nv)], ok: nv ? "WPS activé" : "WPS désactivé")
                    }
                }
            }

            if !mlo.isNull {
                NetworkCard(title: "Wi-Fi 7", icon: "bolt", ssid: mlo["id"].string ?? "", pass: mlo["security"]["passphrase"].string, proto: mlo["security"]["protocol"].string,
                            chips: ["MLO · multi-bandes", Fmt.plural(count(active, "MLO"), "appareil")], hidden: mlo["hidden"].int == 1,
                            note: "Réseau multi-liens réservé aux appareils Wi-Fi 7 : ils utilisent plusieurs bandes à la fois.") {
                    sheet = .edit(path: "wireless/mlo", title: "Wi-Fi 7", ssid: mlo, canHide: true, main: false)
                }
            }

            if !guest.isNull {
                let on = guest["enable"].int == 1
                NetworkCard(title: "Wi-Fi invité", icon: "link", ssid: guest["id"].string ?? "", pass: guest["security"]["passphrase"].string, proto: guest["security"]["protocol"].string,
                            chips: on ? [Fmt.plural(store.guestHosts.filter(\.active).count, "invité"), store.guestTimer.map { "coupure \(Fmt.until($0.until))" } ?? "sans limite de durée"] : ["désactivé"],
                            note: "Isolé de votre réseau : vos invités accèdent à Internet sans voir vos appareils. L’activer ou le couper redémarre le Wi-Fi (≈ 40 s).",
                            dim: !on, toggle: AnyView(Btn(on ? "Gérer" : "Activer", kind: on ? .soft : .go, size: .sm, icon: on ? "timer" : "link") { sheet = .guest })) {
                    sheet = .edit(path: "wireless/guest", title: "Wi-Fi invité", ssid: guest, canHide: false, main: false)
                }
            }

            Card("Bandes radio", icon: "activity") {
                Note("débit en direct, hors Wi-Fi 7 (MLO)").padding(.top, -8).padding(.bottom, 12)
                VStack(spacing: 12) {
                    ForEach(bands, id: \.k) { b in
                        BandTile(store: store, k: b.k, label: b.l, w: w,
                                 n: b.k == "24" ? count(active, "Wifi 2|2\\.4|Wifi 24") : count(active, "Wifi \(b.k)(?!\\d)"), proto: Self.proto)
                    }
                }
            }
        }
    }
}

/// Pastille d'état du Wi-Fi (en-tête de page).
private struct WifiPill: View {
    var on: Bool
    @Environment(\.palette) private var p
    var body: some View {
        HStack(spacing: 8) {
            LiveDot(bad: !on)
            Text(on ? "Wi-Fi actif" : "Wi-Fi coupé").ui(p.isGeist ? 12.5 : 13.5, p.isGeist ? .medium : .semibold)
        }
        .foregroundStyle(on ? p.ok : p.danger)
        .padding(.horizontal, p.isGeist ? 10 : 14)
        .frame(height: p.isGeist ? 28 : 36)
        .background(on ? p.okSoft : p.dangerSoft, in: Capsule())
    }
}

private struct NetworkCard: View {
    var title: String
    var icon: String
    var ssid: String
    var pass: String?
    var proto: String?
    var chips: [String] = []
    var hidden = false
    var note: String?
    var dim = false
    var toggle: AnyView?
    var onEdit: () -> Void
    @Environment(\.palette) private var p
    private static let proto = ["WPA2-WPA3": "WPA2/WPA3", "WPA3": "WPA3", "WPA2": "WPA2", "WPA-WPA2": "WPA/WPA2", "None": "Ouvert"]

    var body: some View {
        let label: CGFloat = p.isGeist ? 12 : 12.5
        Card(title, icon: icon, action: {
            if let toggle { toggle } else { Btn("Modifier", kind: .plain, size: .sm, icon: "edit", action: onEdit).padding(.trailing, -8) }
        }) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Nom du réseau" + (hidden ? " · masqué" : "")).ui(label).foregroundStyle(p.mutedForeground)
                Text(ssid).ui(22, p.isGeist ? .medium : .semibold, tracking: p.isGeist ? -0.035 : -0.015)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 4).padding(.bottom, 12)
                Text("Mot de passe · \(proto.flatMap { Self.proto[$0] ?? $0 } ?? "")").ui(label).foregroundStyle(p.mutedForeground)
                Secret(value: pass ?? "")
                if !chips.isEmpty { FlowRow(spacing: 6) { ForEach(chips, id: \.self) { Chip($0) } }.padding(.top, 12) }
                if let note { Note(note).padding(.top, 12) }
                if toggle != nil { Btn("Modifier", kind: .ghost, size: .sm, icon: "edit", action: onEdit).padding(.top, 14) }
                VStack(spacing: 8) {
                    QRTile(text: Fmt.wifiQR(ssid: ssid, passphrase: pass, security: proto), dim: dim)
                        .animation(.easeOut(duration: 0.3), value: dim)
                        .accessibilityLabel("QR code du réseau \(ssid)")
                    Text(dim ? "Réseau désactivé" : "Scannez pour vous connecter").ui(12.5).foregroundStyle(p.mutedForeground)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 20)
            }
        }
    }
}

private struct BandTile: View {
    var store: PanelStore
    var k: String
    var label: String
    var w: JSON
    var n: Int
    var proto: [String: String]
    @Environment(\.palette) private var p

    var body: some View {
        let r = w["radio"][k], ssid = w["ssid"][k]
        let on = r["enable"].isOn && r["state"].isOn
        let rate = (store.bands[k]["down"].double ?? 0) + (store.bands[k]["up"].double ?? 0)
        let pr = ssid["security"]["protocol"].string
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(label).ui(15, p.isGeist ? .medium : .semibold)
                Spacer()
                Chip(on ? "Active" : "Arrêtée", tone: on ? .ok : .off, dot: true)
            }
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(Fmt.kbps(rate)).ui(24, p.isGeist ? .medium : .semibold, tracking: -0.02).monospacedDigit().lineLimit(1).contentTransition(.numericText())
                    Text(Fmt.plural(n, "appareil")).ui(12.5).foregroundStyle(p.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Sparkline(points: store.points("b" + k), color: p.isGeist ? p.down : p.brand).frame(width: 120, height: 40)
            }
            .padding(.top, 12).padding(.bottom, 6)
            KV([kv("Canal", "\(r["current_channel"].string ?? "—")" + (r["channel"].int == 0 ? " (auto)" : "")),
                kv("Largeur", "\(r["current_bandwidth"].string ?? "—") MHz" + (r["htbw"].int == 0 ? " (auto)" : "")),
                kv("Norme", w["standard"][k][0]["value"].string ?? r["standard"].string),
                kv("Sécurité", pr.flatMap { proto[$0] ?? $0 })])
        }
        .padding(p.isGeist ? 0 : 16)
        .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous).fill(p.surface) } }
    }
}

/// Modifier un réseau (nom, mot de passe, masquage), comme `editMain` / `editSimple` du web.
private struct WifiEditSheet: View {
    var store: PanelStore
    var path: String
    var title: String
    var ssid: JSON
    var canHide: Bool
    var main: Bool
    @State private var name = ""
    @State private var pass = ""
    @State private var hidden = false
    @State private var applyMlo = true
    @State private var confirm = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    private var nameErr: String? { name.trimmingCharacters(in: .whitespaces).isEmpty ? "Nom requis" : name.count > 32 ? "32 caractères maximum" : nil }
    private var passErr: String? {
        if pass.isEmpty { return nil }
        if pass.count < 8 { return "8 caractères minimum" }
        if pass.count > 63 { return "63 caractères maximum" }
        return pass.unicodeScalars.contains { $0.value < 0x20 || $0.value > 0x7e } ? "Caractères ASCII uniquement" : nil
    }
    private var hasMlo: Bool { main && !store.w["ssid"]["mlo"].isNull }

    var body: some View {
        SheetScaffold(title: title) {
            if main { Note("Tous les appareils sans fil seront déconnectés et devront se reconnecter avec les nouveaux identifiants.") }
            field("Nom du réseau", $name, error: nameErr)
            VStack(alignment: .leading, spacing: 6) {
                Text("Nouveau mot de passe").ui(13, .medium)
                SecureField("Inchangé si vide", text: $pass).ui(16).textContentType(.newPassword)
                    .padding(.horizontal, 12).frame(height: 44)
                    .background(p.isGeist ? p.field : p.card, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous).strokeBorder(passErr != nil ? p.danger : (p.isGeist ? .clear : p.input), lineWidth: 1) }
                Text(passErr ?? "8 à 63 caractères. Une phrase longue est plus sûre qu’un mot compliqué.").ui(12.5).foregroundStyle(passErr != nil ? p.danger : p.mutedForeground)
            }
            if hasMlo {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Appliquer aussi au Wi-Fi 7").ui(14.5, p.isGeist ? .medium : .semibold)
                        Text("Le réseau Wi-Fi 7 s’appellera « <nom>-Plus », comme le fait la Bbox.").ui(13).foregroundStyle(p.mutedForeground)
                    }
                    Spacer()
                    KitSwitch(isOn: applyMlo) { applyMlo = $0 }
                }
            }
            if canHide {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Masquer le nom du réseau").ui(14.5, p.isGeist ? .medium : .semibold)
                        Text("Le réseau n’apparaît plus dans les listes ; il faut saisir son nom pour s’y connecter.").ui(13).foregroundStyle(p.mutedForeground)
                    }
                    Spacer()
                    KitSwitch(isOn: hidden) { hidden = $0 }
                }
            }
        } footer: {
            Spacer(minLength: 0)
            Btn("Annuler", kind: .ghost) { dismiss() }
            Btn("Enregistrer", kind: .go, disabled: nameErr != nil || passErr != nil) {
                if main { confirm = true } else { await save() }
            }
        }
        .alert("Changer les identifiants Wi-Fi ?", isPresented: $confirm) {
            Button("Appliquer") { Task { await save() } }
            Button("Annuler", role: .cancel) {}
        } message: { Text("Les appareils connectés en Wi-Fi seront coupés, y compris celui-ci s’il est en Wi-Fi.") }
        .onAppear { name = ssid["id"].string ?? ""; hidden = ssid["hidden"].int == 1 }
    }

    private func save() async {
        var form: BboxForm = ["ssid": .string(name.trimmingCharacters(in: .whitespaces))]
        if !pass.isEmpty { form.fields.append(.init(key: "passphrase", value: .string(pass))) }
        if canHide { form.fields.append(.init(key: "hidden", value: .bool(hidden))) }
        let mlo = hasMlo && applyMlo
        let plus = String(name.trimmingCharacters(in: .whitespaces).prefix(27)) + "-Plus"
        let ok = await store.run("\(title) mis à jour", refresh: ["wireless", "statics"]) { [backend = store.backend, path] in
            try await backend.write(.put, path, form)
            if mlo {
                var m = form
                m.fields[0].value = .string(plus)
                try await backend.write(.put, "wireless/mlo", m)
            }
        }
        if ok { dismiss() }
    }

    private func field(_ label: String, _ text: Binding<String>, error: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).ui(13, .medium)
            TextField(label, text: text).ui(16).autocorrectionDisabled().textInputAutocapitalization(.never)
                .padding(.horizontal, 12).frame(height: 44)
                .background(p.isGeist ? p.field : p.card, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous).strokeBorder(error != nil ? p.danger : (p.isGeist ? .clear : p.input), lineWidth: 1) }
            if let error { Text(error).ui(12.5).foregroundStyle(p.danger) }
        }
    }
}
