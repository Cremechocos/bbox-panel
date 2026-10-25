import SwiftUI

/// Ma Bbox (`views/bbox.tsx`, version iPhone) : matériel, santé en direct, historique 24 h, redémarrage.
struct BboxScreen: View {
    var store: PanelStore
    @State private var confirmReboot = false
    @State private var serial: String?
    @Environment(\.palette) private var p

    private static let model = ["f@st5696b": "Bbox Wi-Fi 7", "fast5696b": "Bbox Wi-Fi 7", "f@st5688b": "Bbox Wi-Fi 6E", "f@st5686b": "Bbox Ultym"]

    var body: some View {
        let dev = store.dev
        let model = dev.isNull ? "Bbox" : Self.model[(dev["modelname"].string ?? "").lowercased()] ?? "Bbox"
        let chart1 = p.isGeist ? p.down : p.brand, chart2 = p.isGeist ? p.up : p.logo
        Page(title: "Ma Bbox", back: true, refresh: { await store.refresh() }) {
            PageHead(kicker: model, title: "Ma Bbox",
                     sub: dev.isNull ? "…" : "\(dev["modelname"].string ?? "") · allumée depuis \(Fmt.duration(dev["uptime"].int ?? 0)) · \(dev["numberofboots"].int ?? 0) démarrages") {
                Btn("Redémarrer", kind: .dangerGhost, size: .sm, icon: "power") { confirmReboot = true }
            }
            VStack(spacing: 12) {
                Card("Matériel", icon: "box") {
                    if dev.isNull {
                        LoadingPlaceholder()
                    } else {
                        let using = dev["using"]
                        KV([kv("Modèle", "\(model) (\(dev["modelname"].string ?? "—"))"),
                            kv("Firmware") { Text(dev["main"]["version"].string ?? "—").font(.custom("GeistMono-Regular", size: p.isGeist ? 12 : 12.9).weight(.semibold)) },
                            kv("Publié le", Fmt.bboxDate(dev["main"]["date"].string)),
                            kv("Secours") { Text(dev["reco"]["version"].string ?? "—").font(.custom("GeistMono-Regular", size: p.isGeist ? 12 : 12.9).weight(.semibold)) },
                            kv("Mise en service", Fmt.bboxDate(dev["firstusedate"].string)),
                            kv("Accès", [using["ftth"].isOn ? "Fibre" : nil, using["ipv6"].isOn ? "IPv6" : nil, dev["isCellularEnable"].isOn ? "Secours 4G" : nil]
                                .compactMap { $0 }.joined(separator: " · "))])
                        Text("Numéro de série").ui(12.5).foregroundStyle(p.mutedForeground).padding(.top, 12)
                        Secret(value: serial ?? dev["serialnumber"].string ?? "")
                    }
                }
                Card("Santé en direct", icon: "cpu") {
                    let cpu = store.cpuUsage, temp = store.temperature, mem = store.memPercent
                    HStack(alignment: .top) {
                        gauge("Processeur", GaugeView(value: cpu, size: 84, color: chart1, label: "\(Int(cpu.rounded())) %"))
                        gauge("Température", GaugeView(value: temp, max: 90, size: 84, color: temp > 72 ? p.warn : p.chart4, label: Fmt.number(temp, digits: 1) + "°"))
                        gauge("Mémoire", GaugeView(value: mem, size: 84, color: chart2, label: "\(Int(mem.rounded())) %"))
                    }
                    .padding(.bottom, 16)
                    Text("Processeur · 6 dernières minutes").ui(12.5).foregroundStyle(p.mutedForeground).padding(.bottom, 4)
                    LiveChart(series: [.init(data: store.points("cpu"), color: chart1)], windowMs: 360_000, height: 110, format: { "\(Int($0.rounded())) %" }, minMax: 20)
                    Text("Température · 6 dernières minutes").ui(12.5).foregroundStyle(p.mutedForeground).padding(.top, 16).padding(.bottom, 4)
                    LiveChart(series: [.init(data: store.points("temp"), color: p.chart4)], windowMs: 360_000, height: 110, format: { Fmt.number($0, digits: 1) + "°" }, minMax: 60)
                }
                Card("Historique 24 h", icon: "activity") {
                    Text("Température").ui(12.5).foregroundStyle(p.mutedForeground).padding(.bottom, 4)
                    HistoryChart(values: store.graphs["temp"].array.suffix(96).compactMap { $0[1].double.map { $0 / 1000 } }, color: p.chart4, height: 80)
                    Text("Processeur").ui(12.5).foregroundStyle(p.mutedForeground).padding(.top, 14).padding(.bottom, 4)
                    HistoryChart(values: store.graphs["cpu"].array.suffix(96).compactMap { $0[1].double }, color: chart1, bars: true, height: 60)
                }
            }
        }
        .task { serial = try? await store.backend.get("device/summary")["device"]["serialnumber"].string }
        .alert("Redémarrer la Bbox ?", isPresented: $confirmReboot) {
            Button("Redémarrer", role: .destructive) { Task { await store.reboot() } }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Internet, le Wi-Fi, la TV et le téléphone seront coupés pendant 2 à 3 minutes. L’app se reconnectera toute seule.")
        }
    }

    private func gauge(_ caption: String, _ g: GaugeView) -> some View {
        VStack(spacing: 6) {
            g
            Text(caption).ui(12.5).foregroundStyle(p.mutedForeground).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}
