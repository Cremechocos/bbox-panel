import SwiftUI

/// Appareils (`views/devices.tsx`, version iPhone) : recherche, filtres, liste, fiche détaillée.
struct DevicesScreen: View {
    var store: PanelStore
    @State private var q = ""
    @State private var filter = "all"
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p

    private static let filters = [("all", "Tous"), ("on", "Connectés"), ("wifi", "Wi-Fi"), ("eth", "Ethernet"), ("off", "Hors ligne"), ("fav", "Favoris")]

    private func passes(_ h: Host, _ f: String) -> Bool {
        switch f {
        case "on": return h.active
        case "off": return !h.active
        case "wifi": return !h.isEthernet && h.active
        case "eth": return h.isEthernet
        case "fav": return store.prefs.favDevices.contains(h.mac)
        default: return true
        }
    }

    var body: some View {
        let all = store.hosts
        let needle = q.trimmingCharacters(in: .whitespaces).lowercased()
        let list = all.filter { h in
            passes(h, filter) && (needle.isEmpty || [store.name(of: h), h.ip, h.mac, h.manufacturer ?? "", h.json["informations"]["type"].string ?? ""]
                .contains { $0.lowercased().contains(needle) })
        }.sorted {
            if $0.active != $1.active { return $0.active }
            if $0.rate != $1.rate { return $0.rate > $1.rate }
            return store.name(of: $0).localizedCompare(store.name(of: $1)) == .orderedAscending
        }
        let guests = store.guestHosts
        let activeCount = all.filter(\.active).count
        let guestsActive = guests.filter(\.active).count

        Page(title: "Appareils", refresh: { await store.refresh() }) {
            PageHead(kicker: "Réseau principal", title: "Appareils",
                     sub: "\(activeCount) connectés · \(all.count) connus" + (guests.isEmpty ? "" : " · \(Fmt.plural(guestsActive, "invité"))")) {
                Btn("Actualiser", kind: .soft, size: .sm, icon: "refresh") {
                    _ = try? await store.backend.write(.put, "identification/hosts", ["command": "refresh"])
                    await store.refresh()
                    store.toast = Toast(text: "Liste actualisée", isError: false)
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                SearchField(text: $q, placeholder: "Nom, IP, MAC, fabricant…")
                Seg(options: Self.filters.map { f in SegOption(value: f.0, label: f.1, count: all.isEmpty ? nil : all.filter { passes($0, f.0) }.count) }, value: $filter)
            }
            .padding(.bottom, 16)

            if !store.loaded {
                LoadingPlaceholder()
            } else {
                Card("\(list.count) appareil\(list.count > 1 ? "s" : "")", icon: "devices", flush: true) {
                    if list.isEmpty {
                        EmptyState(icon: "search", title: "Aucun appareil", text: "Aucun appareil ne correspond à cette recherche.")
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(list.enumerated()), id: \.element.id) { i, h in DeviceRow(store: store, host: h, first: i == 0) }
                        }
                    }
                }
                if !guests.isEmpty {
                    Card("Wi-Fi invité · \(guests.count)", icon: "link", flush: true) {
                        VStack(spacing: 0) {
                            ForEach(Array(guests.enumerated()), id: \.element.id) { i, h in DeviceRow(store: store, host: h, guest: true, first: i == 0) }
                        }
                    }
                    .padding(.top, 16)
                }
                Note("Mise à jour en direct. Ouvrez un appareil pour le mettre en pause, le renommer, le réveiller, l’épingler ou l’analyser.")
                    .padding(.horizontal, 4).padding(.top, 14)
            }
        }
    }
}

/// Champ de recherche du kit (`Input` avec icône).
struct SearchField: View {
    @Binding var text: String
    var placeholder: String
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: 8) {
            LucideIcon("search", size: 16).foregroundStyle(p.mutedForeground)
            TextField(placeholder, text: $text)
                .ui(16)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button { text = "" } label: { LucideIcon("x", size: 14).foregroundStyle(p.mutedForeground) }.buttonStyle(.plain).accessibilityLabel("Effacer")
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 44)
        .background(p.isGeist ? p.field : p.card, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous).strokeBorder(p.isGeist ? .clear : p.input, lineWidth: 1) }
    }
}

struct DeviceRow: View {
    var store: PanelStore
    var host: Host
    var guest = false
    var first = false
    @Environment(Navigator.self) private var nav
    @Environment(\.palette) private var p

    var body: some View {
        let h = host, pz = store.pauseTimer(for: h), sig = Host.signal(h.rssi)
        let seen = h.lastSeenSeconds > 0 ? "vu " + Fmt.relativeShort(Date().addingTimeInterval(-Double(h.lastSeenSeconds))) : "hors ligne"
        let sub = pz.map { "en pause jusqu’à \(Fmt.until($0.until))" } ?? [h.ip, h.active ? Fmt.band(h.link, h.band) : seen].filter { !$0.isEmpty }.joined(separator: " · ")
        Row(first: first, action: { nav.device = h }) {
            Avatar(icon: h.kindIcon, on: h.active, paused: pz != nil)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text(store.name(of: h)).lineLimit(1)
                    if !guest && store.prefs.favDevices.contains(h.mac) { LucideIcon("starfill", size: 12).foregroundStyle(p.chart4).accessibilityLabel("Favori") }
                }
                .ui(p.isGeist ? 13.5 : 15, p.isGeist ? .medium : .semibold)
                .foregroundStyle(h.active ? p.foreground : p.mutedForeground)
                Text(sub).ui(p.isGeist ? 12.5 : 13).foregroundStyle(pz != nil ? p.warn : p.mutedForeground).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if h.active {
                if h.isEthernet { LucideIcon("ethernet", size: 18).foregroundStyle(p.mutedForeground) } else { SignalBars(bars: sig.bars).accessibilityLabel(sig.label) }
            }
            LucideIcon("chevron", size: 18).foregroundStyle(p.mutedForeground)
        }
    }
}

// MARK: - Fiche appareil

struct DeviceSheet: View {
    var store: PanelStore
    var mac: String
    @State private var diag: (kind: String, data: JSON)?
    @State private var runID = 0
    @State private var sheet: Sub?
    @State private var confirmForget = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    enum Sub: String, Identifiable { case pause, rename; var id: String { rawValue } }

    var body: some View {
        let guestHost = store.guestHosts.first { $0.mac == mac }
        if let h = store.hosts.first(where: { $0.mac == mac }) ?? guestHost {
            let guest = guestHost != nil && !store.hosts.contains { $0.mac == mac }
            let desc = [h.json["informations"]["type"].string, h.manufacturer].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            VStack(spacing: 0) {
                SheetHeader(title: store.name(of: h), description: desc.isEmpty ? "Appareil" : desc) {
                    if !guest && store.isRelay {
                        let on = store.prefs.favDevices.contains(h.mac)
                        IconBtn(icon: on ? "starfill" : "star", label: on ? "Retirer des favoris" : "Ajouter aux favoris", size: 19) { Task { await store.toggleFavorite(h) } }
                            .foregroundStyle(on ? p.chart4 : p.mutedForeground)
                    }
                }
                ScrollView { content(h, guest: guest).padding(.horizontal, p.isGeist ? 16 : 20).padding(.bottom, 24) }
            }
            .sheet(item: $sheet) { s in
                Group {
                    if s == .pause { PauseSheet(store: store, host: h) } else { RenameSheet(store: store, host: h) }
                }
                .kitSheet()
            }
            .alert("Retirer cet appareil ?", isPresented: $confirmForget) {
                Button("Retirer", role: .destructive) { Task { if await store.forget(h) { dismiss() } } }
                Button("Annuler", role: .cancel) {}
            } message: { Text("Il disparaîtra de la liste jusqu’à sa prochaine connexion.") }
        } else {
            VStack { SheetHeader(title: "Appareil"); EmptyState(title: "Appareil introuvable"); Spacer() }
        }
    }

    @ViewBuilder private func content(_ h: Host, guest: Bool) -> some View {
        let pz = store.pauseTimer(for: h)
        let sig = Host.signal(h.rssi), eth = h.isEthernet, rate = h.json["wireless"]["estimatedRate"].double ?? (eth ? h.json["ethernet"]["speed"].double ?? 0 : 0)
        let reserved = store.dhcpClients.first { ($0["macaddress"].string ?? "").lowercased() == h.mac }
        let running = diag?.data["status"].string == "Running"
        VStack(alignment: .leading, spacing: 0) {
            // identité et actions rapides
            VStack(spacing: 0) {
                HStack(spacing: p.isGeist ? 12 : 16) {
                    HeroAvatar(host: h, paused: pz != nil)
                    VStack(alignment: .leading, spacing: 8) {
                        FlowRow(spacing: 6) {
                            if h.active { Chip("Connecté", tone: .ok, dot: true) } else { Chip("Hors ligne", tone: .off, dot: true) }
                            if let pz { Chip("En pause jusqu’à \(Fmt.until(pz.until))", tone: .warn) }
                            if h.scheduled { Chip("Plages de pause") }
                            if h.preferred { Chip("Prioritaire", tone: .brand) }
                            if guest { Chip("Invité") }
                        }
                        if !guest && pz == nil {
                            HStack(spacing: 6) { LucideIcon("globe", size: 14); Text("Accès à Internet autorisé").lineLimit(1) }
                                .ui(13).foregroundStyle(p.mutedForeground)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(p.isGeist ? 0 : 16)
                .padding(.bottom, p.isGeist ? 12 : 0)
                let actions = quickActions(h, guest: guest, paused: pz != nil, running: running)
                if !actions.isEmpty {
                    if p.isGeist {
                        FlowRow(spacing: 6) { ForEach(actions) { a in ActionCell(action: a) } }
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        HStack(spacing: 0) {
                            ForEach(Array(actions.enumerated()), id: \.element.id) { i, a in
                                ActionCell(action: a)
                                    .overlay(alignment: .leading) { if i > 0 { Rectangle().fill(p.border).frame(width: 1) } }
                            }
                        }
                        .overlay(alignment: .top) { Rectangle().fill(p.border).frame(height: 1) }
                    }
                }
            }
            .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radius2XL, style: .continuous).fill(p.surface) } }
            .clipShape(RoundedRectangle(cornerRadius: p.isGeist ? 0 : p.radius2XL, style: .continuous))
            .padding(.top, 4)

            if let diag {
                DiagPanel(kind: diag.kind, data: diag.data) { self.diag = nil }
                    .padding(p.isGeist ? 0 : 16)
                    .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous).fill(p.surface) } }
                    .padding(.top, 12)
                    .transition(.opacity.combined(with: .offset(y: 8)))
            }

            // mesures en direct
            HStack(spacing: 10) {
                if h.active {
                    LiveTile(icon: eth ? "ethernet" : "wifi", label: "Connexion", value: Fmt.band(h.link, h.band)) {
                        if eth, let port = h.json["ethernet"]["logicalport"].string { Text("port \(port)").lineLimit(1) } else if !eth { SignalBars(bars: sig.bars); Text(sig.label).lineLimit(1) }
                    }
                    LiveTile(icon: "zap", label: eth ? "Vitesse du lien" : "Débit estimé", value: rate > 0 ? Fmt.mbps(rate) : "—") {
                        if !eth, let r = h.rssi { Text("\(r) dBm").monospacedDigit().lineLimit(1) }
                    }
                } else {
                    LiveTile(icon: "clock", label: "Dernière connexion", value: h.lastSeenSeconds > 0 ? Fmt.relativeShort(Date().addingTimeInterval(-Double(h.lastSeenSeconds))) : "inconnue") {
                        Text(eth ? "en Ethernet" : h.band.isEmpty ? "hors ligne" : "en \(Fmt.band(h.link, h.band))").lineLimit(1)
                    }
                    LiveTile(icon: eth ? "ethernet" : "wifi", label: eth ? "Lien" : "Dernier signal", value: !eth ? h.rssi.map { "\($0) dBm" } ?? "—" : "—") {
                        if !eth, h.rssi != nil { SignalBars(bars: sig.bars); Text(sig.label).lineLimit(1) }
                    }
                }
            }
            .padding(.top, 12)

            SectionTitle("Détails")
            KV([kv("Adresse IP") { Text(h.ip.isEmpty ? "—" : h.ip).font(.custom("GeistMono-Regular", size: 13.5)).textSelection(.enabled) },
                kv("Adresse MAC") { Text(h.mac).font(.custom("GeistMono-Regular", size: 13.5)).textSelection(.enabled) },
                kv("Attribution", h.json["type"].string == "Static" || reserved != nil ? "IP réservée" : "DHCP"),
                h.json["ip6address"][0]["ipaddress"].string.map { ip6 in kv("IPv6") { Text(ip6).font(.custom("GeistMono-Regular", size: 12)).lineLimit(1).minimumScaleFactor(0.6) } },
                kv("Vu pour la première fois", Fmt.bboxDate(h.firstSeen)),
                !h.active && h.lastSeenSeconds > 0 ? kv("Dernière connexion", Fmt.relativeShort(Date().addingTimeInterval(-Double(h.lastSeenSeconds)))) : nil,
                h.json["informations"]["operatingSystem"].string.map { kv("Système", $0) }])
                .padding(.horizontal, p.isGeist ? 0 : 16)
                .padding(.vertical, p.isGeist ? 0 : 6)
                .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous).fill(p.surface) } }

            if !guest {
                SectionTitle("Réglages")
                VStack(spacing: 0) {
                    ToggleRow(title: "Soumis aux plages de pause", sub: "Applique les plages horaires définies dans « Pauses & contrôle »", value: h.scheduled, first: true) {
                        await store.setScheduled(h, $0)
                    }
                    if h.isWifi && !h.isRepeater {
                        if store.preferredAvailable {
                            ToggleRow(title: "Appareil prioritaire", sub: "La Bbox lui donne la priorité sur le Wi-Fi", value: h.preferred) { await store.setPriority(h, $0) }
                        } else {
                            ToggleRow(title: "Appareil prioritaire", sub: "Non proposé par votre Bbox : son firmware n’inclut pas la priorisation (l’interface officielle la masque aussi).",
                                      value: false, disabled: true) { _ in false }
                        }
                    }
                    if !eth {
                        ToggleRow(title: "Figer sur sa bande Wi-Fi", sub: "Empêche la Bbox de le basculer entre 2,4 / 5 / 6 GHz", value: h.json["wireless"]["static"].int == 1) {
                            await store.setBandLock(h, $0)
                        }
                    }
                }
                .padding(.horizontal, p.isGeist ? 0 : 16)
                .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous).fill(p.surface) } }
            }

            if !h.active && !guest {
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Retirer cet appareil").ui(14.5, p.isGeist ? .medium : .semibold)
                        Text("Il disparaîtra de la liste jusqu’à sa prochaine connexion.").ui(13).foregroundStyle(p.mutedForeground).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Btn("Retirer", kind: .dangerGhost, size: .sm, icon: "trash") { confirmForget = true }
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                .background { RoundedRectangle(cornerRadius: p.isGeist ? p.radius : p.radiusXL, style: .continuous).fill(p.isGeist ? .clear : p.surface) }
                .overlay { if p.isGeist { RoundedRectangle(cornerRadius: p.radius, style: .continuous).strokeBorder(p.danger.mix(p.border, 0.32), lineWidth: 1) } }
                .padding(.top, 24)
            }
        }
        .animation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.24), value: diag?.kind)
    }

    private func quickActions(_ h: Host, guest: Bool, paused: Bool, running: Bool) -> [ActionCell.Item] {
        var a: [ActionCell.Item] = []
        if !guest && store.isRelay {
            a.append(paused ? .init(id: "resume", icon: "play", label: "Reprendre", warn: true) { _ = await store.resume(h) }
                            : .init(id: "pause", icon: "pause", label: "Pause") { sheet = .pause })
        }
        if h.active {
            a.append(.init(id: "ping", icon: "activity", label: "Ping", disabled: running) { await runDiag(h, guest: guest, kind: "ping") })
            a.append(.init(id: "scan", icon: "search", label: "Ports", disabled: running) { await runDiag(h, guest: guest, kind: "scan") })
        }
        if !guest { a.append(.init(id: "rename", icon: "edit", label: "Renommer") { sheet = .rename }) }
        if !h.active && !guest { a.append(.init(id: "wake", icon: "power", label: "Réveiller") { await store.wake(h) }) }
        return a
    }

    /// Ping ou analyse de ports par la Bbox : POST `{action}` puis relecture de l'appareil chaque seconde.
    private func runDiag(_ h: Host, guest: Bool, kind: String) async {
        runID += 1
        let my = runID
        let base = guest ? "guests/\(h.id)" : "hosts/\(h.id)"
        diag = (kind, ["status": "Running"])
        do {
            // la Bbox coupe parfois la connexion en réponse à l'action (le test tourne quand même)
            do { try await store.backend.write(.post, base, ["action": .string(kind)]) } catch PanelError.http(502, _) {}
            var seenRunning = false
            for i in 0..<40 {
                try await Task.sleep(for: .seconds(1))
                guard runID == my else { return }
                let raw = try await store.backend.get(base)
                let o = !raw["host"].isNull ? raw["host"] : !raw["hosts"]["list"][0].isNull ? raw["hosts"]["list"][0] : raw
                let d = o[kind]
                if d["status"].string == "Running" { seenRunning = true }
                let finished = !d.isNull && d["status"].string != nil && d["status"].string != "Running" && (seenRunning || i >= 2)
                guard runID == my else { return }
                diag = (kind, finished ? d : d.merging(["status": "Running"]))
                if finished { return }
            }
            if runID == my { diag = nil; store.toast = Toast(text: "Le test n’a pas abouti : réessayez dans un instant.", isError: true) }
        } catch is CancellationError {
        } catch {
            if runID == my { diag = nil; store.toast = Toast(text: (error as? LocalizedError)?.errorDescription ?? "Test impossible.", isError: true) }
        }
    }
}

/// Grand avatar de la fiche : pastille d'état découpée.
private struct HeroAvatar: View {
    var host: Host
    var paused: Bool
    @Environment(\.palette) private var p

    var body: some View {
        LucideIcon(host.kindIcon, size: p.isGeist ? 21 : 28)
            .foregroundStyle(p.isGeist ? p.foreground : p.foreground.mix(p.brand, 0.78))
            .frame(width: p.isGeist ? 44 : 64, height: p.isGeist ? 44 : 64)
            .background(p.isGeist ? p.selected : p.card, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radius : 18, style: .continuous))
            .shadow(color: p.isGeist || p.dark ? .clear : Color(hex: 0x132331, alpha: 0.06), radius: 6, y: 4)
            .overlay(alignment: .bottomTrailing) {
                Group {
                    if host.active && !paused { LiveDot() } else { Circle().fill(paused ? p.warn : p.mutedForeground.mix(p.card, 0.55)).frame(width: 8, height: 8) }
                }
                .frame(width: 18, height: 18)
                .background(p.isGeist ? p.glass : p.card, in: Circle())
                .offset(x: 4, y: 4)
            }
    }
}

/// Cellule de la barre d'actions de la fiche (`ActionBtn`).
struct ActionCell: View {
    struct Item: Identifiable {
        var id: String
        var icon: String
        var label: String
        var disabled = false
        var warn = false
        var run: () async -> Void
    }
    var action: Item
    @State private var busy = false
    @Environment(\.palette) private var p

    var body: some View {
        Button {
            guard !busy else { return }
            Task { busy = true; await action.run(); busy = false }
        } label: {
            Group {
                if p.isGeist {
                    HStack(spacing: 6) { icon(15); Text(action.label).lineLimit(1) }
                        .ui(13)
                        .padding(.horizontal, 10).frame(height: 40)
                        .background(p.selected, in: RoundedRectangle(cornerRadius: p.radiusMD, style: .continuous))
                } else {
                    VStack(spacing: 6) { icon(18).foregroundStyle(action.warn ? p.warn : p.brand); Text(action.label).lineLimit(1) }
                        .ui(12.5, .semibold)
                        .frame(maxWidth: .infinity).frame(height: 66)
                }
            }
            .foregroundStyle(action.warn ? p.warn : p.foreground.mix(p.mutedForeground, 0.84))
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .disabled(action.disabled || busy)
        .opacity(action.disabled ? 0.4 : 1)
    }

    @ViewBuilder private func icon(_ size: CGFloat) -> some View {
        if busy { ProgressView().controlSize(.small).frame(width: size, height: size) } else { LucideIcon(action.icon, size: size) }
    }
}

private struct LiveTile<Extra: View>: View {
    var icon: String
    var label: String
    var value: String
    @ViewBuilder var extra: Extra
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) { LucideIcon(icon, size: 14); Text(label).lineLimit(1) }.ui(12).foregroundStyle(p.mutedForeground)
            Text(value).ui(p.isGeist ? 18 : 19, p.isGeist ? .medium : .semibold, tracking: -0.02).monospacedDigit().lineLimit(1)
                .contentTransition(.numericText()).padding(.top, 4)
            HStack(spacing: 6) { extra }.ui(12.5).foregroundStyle(p.mutedForeground).frame(height: 18).padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, p.isGeist ? 0 : 14).padding(.vertical, p.isGeist ? 0 : 12)
        .background { if !p.isGeist { RoundedRectangle(cornerRadius: p.radiusXL, style: .continuous).fill(p.surface) } }
    }
}

private struct DiagPanel: View {
    var kind: String
    var data: JSON
    var close: () -> Void
    @Environment(\.palette) private var p

    private func ms(_ us: JSON) -> String {
        guard let v = us.double, v > 0 else { return "—" }
        return Fmt.number(v / 1000, digits: v / 1000 < 10 ? 1 : 0) + " ms"
    }

    var body: some View {
        let running = data["status"].string == "Running"
        let services = data["services"].array
        let open = services.filter { ($0["state"].string ?? "").localizedCaseInsensitiveContains("open") }
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                LucideIcon(kind == "ping" ? "activity" : "search", size: 16).foregroundStyle(p.mutedForeground)
                Text(kind == "ping" ? "Ping" : "Analyse des ports").ui(14, p.isGeist ? .medium : .semibold)
                Spacer()
                if running { ProgressView().controlSize(.small).tint(p.brand) } else { IconBtn(icon: "x", label: "Fermer", size: 16, action: close).padding(.vertical, -6) }
            }
            .frame(minHeight: 32)
            if kind == "ping" {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(ms(data["average"])).ui(26, p.isGeist ? .medium : .semibold, tracking: -0.03).monospacedDigit()
                        Text("Temps moyen").ui(12.5).foregroundStyle(p.mutedForeground)
                    }
                    Spacer()
                    let ok = (data["success"].int ?? 0) > 0
                    Chip(running ? "En cours…" : ok ? "Répond" : "Ne répond pas", tone: running ? .brand : ok ? .ok : .danger, dot: true)
                }
                if !running && (!data["min"].isNull || !data["tries"].isNull) {
                    KV([data["min"].isNull ? nil : kv("Min / max", "\(ms(data["min"])) / \(ms(data["max"]))"),
                        data["tries"].isNull ? nil : kv("Réponses", "\(data["success"].int ?? 0) sur \(data["tries"].int ?? 0)")])
                }
            } else if running && services.isEmpty {
                Note("Analyse des ports courants…")
            } else if !open.isEmpty {
                FlowRow(spacing: 6) { ForEach(Array(open.enumerated()), id: \.offset) { _, x in Chip("\(x["port"].string ?? "?")/\(x["protocol"].string ?? "")", tone: .warn) } }
            } else {
                Note("Aucun port ouvert parmi les \(services.count) ports courants testés.")
            }
        }
    }
}

/// Renommer (réservation DHCP, comme l'IHM officielle) : le nom libre est converti pour la Bbox.
struct RenameSheet: View {
    var store: PanelStore
    var host: Host
    @State private var name = ""
    @State private var ip = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    private var ipValid: Bool { ip.range(of: "^(25[0-5]|2[0-4]\\d|1?\\d?\\d)(\\.(25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}$", options: .regularExpression) != nil }

    var body: some View {
        let slug = Host.bboxHostname(name)
        SheetScaffold(title: "Renommer", description: store.name(of: host)) {
            Note("Le nom est enregistré dans une réservation d’adresse (bail DHCP fixe), comme le fait l’interface officielle : l’appareil gardera aussi son adresse IP.")
            field("Nom", text: $name, hint: slug != name.trimmingCharacters(in: .whitespaces) && !slug.isEmpty ? "Enregistré dans la Bbox sous « \(slug) »." : nil)
            field("Adresse IP réservée", text: $ip, keyboard: .decimalPad, hint: ip.isEmpty || ipValid ? nil : "Adresse IPv4 invalide", error: !ip.isEmpty && !ipValid)
        } footer: {
            Spacer(minLength: 0)
            Btn("Annuler", kind: .ghost) { dismiss() }
            Btn("Enregistrer", kind: .go, disabled: slug.isEmpty || !ipValid) {
                if await store.rename(host, to: name.trimmingCharacters(in: .whitespaces), ip: ip.trimmingCharacters(in: .whitespaces)) { dismiss() }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            name = store.name(of: host)
            ip = store.dhcpClients.first { ($0["macaddress"].string ?? "").lowercased() == host.mac }?["ipaddress"].string ?? host.ip
        }
    }

    private func field(_ label: String, text: Binding<String>, keyboard: UIKeyboardType = .default, hint: String? = nil, error: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).ui(13, .medium)
            TextField(label, text: text)
                .ui(16).keyboardType(keyboard).autocorrectionDisabled()
                .padding(.horizontal, 12).frame(height: 44)
                .background(p.isGeist ? p.field : p.card, in: RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: p.isGeist ? p.radiusMD : 12, style: .continuous).strokeBorder(error ? p.danger : (p.isGeist ? .clear : p.input), lineWidth: 1) }
            if let hint { Text(hint).ui(12.5).foregroundStyle(error ? p.danger : p.mutedForeground) }
        }
    }
}
