import SwiftUI

// Graphiques repris de `web/src/components/charts.tsx` : mêmes courbes monotones, mêmes échelles « rondes »,
// mêmes dégradés et épaisseurs de trait.

/// Point d'une série du relais (`{t, v}`) ; `v == nil` = mesure perdue.
struct Pt: Equatable {
    var t: Double
    var v: Double?
}

enum ChartMath {
    /// Courbe monotone (Fritsch–Carlson) : lisse sans dépasser les valeurs réelles.
    static func monotone(_ pts: [CGPoint], into path: inout Path, move: Bool = true) {
        let n = pts.count
        guard n > 0 else { return }
        if move { path.move(to: pts[0]) } else { path.addLine(to: pts[0]) }
        guard n > 1 else { return }
        var dx = [CGFloat](repeating: 0, count: n - 1), m = dx
        for i in 0..<(n - 1) {
            dx[i] = pts[i + 1].x - pts[i].x
            m[i] = dx[i] != 0 ? (pts[i + 1].y - pts[i].y) / dx[i] : 0
        }
        var t = [CGFloat](repeating: 0, count: n)
        t[0] = m[0]; t[n - 1] = m[n - 2]
        if n > 2 {
            for i in 1..<(n - 1) {
                t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i])
            }
        }
        for i in 0..<(n - 1) {
            let h3 = dx[i] / 3
            path.addCurve(to: pts[i + 1],
                          control1: CGPoint(x: pts[i].x + h3, y: pts[i].y + t[i] * h3),
                          control2: CGPoint(x: pts[i + 1].x - h3, y: pts[i + 1].y - t[i + 1] * h3))
        }
    }

    /// Découpe en segments continus (les valeurs nulles sont des trous).
    static func segments(_ pts: [(CGFloat, CGFloat?)]) -> [[CGPoint]] {
        var out: [[CGPoint]] = [], cur: [CGPoint] = []
        for (x, y) in pts {
            if let y { cur.append(CGPoint(x: x, y: y)) } else if !cur.isEmpty { out.append(cur); cur = [] }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    /// Pas « rond » (1, 1,5, 2, 2,5, 3, 5 × 10ⁿ).
    static func niceStep(_ v: Double) -> Double {
        guard v > 0 else { return 1 }
        let p = pow(10, floor(log10(v))), r = v / p
        let k: Double = r <= 1 ? 1 : r <= 1.5 ? 1.5 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 3 ? 3 : r <= 5 ? 5 : 10
        return k * p
    }

    /// Libellé de graduation : « 0 » pour zéro, sans « ,0 » superflu.
    static func axisText(_ v: Double, _ format: (Double) -> String) -> String {
        if abs(v) < 1e-9 { return "0" }
        return format(v).replacingOccurrences(of: ",0+(?!\\d)", with: "", options: .regularExpression)
    }
}

// MARK: - Sparkline

/// Mini-courbe (`Sparkline`) : aire en dégradé 24 % → 0, trait 1,6, marge de 15 % en haut et en bas.
struct Sparkline: View {
    var data: [Double?]
    var color: Color
    var strokeWidth: CGFloat = 1.6
    var fill = true

    var body: some View {
        Canvas { ctx, size in
            let ok = data.compactMap { $0 }.filter(\.isFinite)
            guard ok.count >= 2 else { return }
            var mx = ok.max()!, mn = ok.min()!
            let flat = mx - mn < 1e-9
            if !flat { let pad = (mx - mn) * 0.15; mx += pad; mn = mn >= 0 ? max(0, mn - pad) : mn - pad }
            let w = size.width, h = size.height
            let pts: [(CGFloat, CGFloat?)] = data.enumerated().map { i, v in
                let x = CGFloat(i) / CGFloat(data.count - 1) * w
                guard let v, v.isFinite else { return (x, nil) }
                return (x, flat ? h * 0.6 : 2 + (h - 4) * (1 - CGFloat((v - mn) / (mx - mn == 0 ? 1 : mx - mn))))
            }
            var line = Path(), area = Path()
            for s in ChartMath.segments(pts) {
                let seg = s.count == 1 ? [CGPoint(x: s[0].x - 1, y: s[0].y), s[0]] : s
                ChartMath.monotone(seg, into: &line)
                var a = Path()
                ChartMath.monotone(s, into: &a)
                a.addLine(to: CGPoint(x: s.last!.x, y: h)); a.addLine(to: CGPoint(x: s[0].x, y: h)); a.closeSubpath()
                area.addPath(a)
            }
            if fill && !flat {
                ctx.fill(area, with: .linearGradient(Gradient(colors: [color.opacity(0.24), color.opacity(0)]), startPoint: .zero, endPoint: CGPoint(x: 0, y: h)))
            }
            ctx.stroke(line, with: .color(color), style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}

extension Sparkline {
    init(points: [Pt], color: Color, strokeWidth: CGFloat = 1.6) {
        self.init(data: points.map(\.v), color: color, strokeWidth: strokeWidth)
    }
}

// MARK: - Barres

/// Mini-histogramme (`MiniBars`) : la dernière barre pleine, les autres à 35 %.
struct MiniBars: View {
    var values: [Double]
    var color: Color
    var gap: CGFloat = 3

    var body: some View {
        Canvas { ctx, size in
            let n = values.count
            guard n > 0 else { return }
            let mx = max(1, values.max() ?? 1), bw = max(0.5, (size.width - gap * CGFloat(n - 1)) / CGFloat(n))
            for (i, v) in values.enumerated() {
                let hh = max(2, CGFloat(v / mx) * (size.height - 6))
                let r = CGRect(x: CGFloat(i) * (bw + gap), y: size.height - hh, width: bw, height: hh)
                ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(color.opacity(i == n - 1 ? 1 : 0.35)))
            }
        }
        .accessibilityHidden(true)
    }
}

/// Historique 24 h de la Bbox (`HistoryChart`) : barres (70 % de large, 85 %) ou aire (22 %, trait 1,8).
struct HistoryChart: View {
    var values: [Double]
    var color: Color
    var bars = false
    var height: CGFloat = 120
    @Environment(\.palette) private var p

    var body: some View {
        if values.isEmpty {
            Text("Pas encore d’historique").ui(13).foregroundStyle(p.mutedForeground).padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Canvas { ctx, size in
                let hi = values.max()!, lo = values.min()!
                let pad = (hi - lo) * 0.2 != 0 ? (hi - lo) * 0.2 : (abs(hi) * 0.05 != 0 ? abs(hi) * 0.05 : 1)
                let mx = bars ? (hi * 1.1 != 0 ? hi * 1.1 : 1) : hi + pad, mn = bars ? 0 : lo - pad
                let H = size.height, W = size.width
                func y(_ v: Double) -> CGFloat { 4 + (H - 8) * (1 - CGFloat((v - mn) / (mx - mn == 0 ? 1 : mx - mn))) }
                if bars {
                    let bw = W / CGFloat(values.count)
                    for (i, v) in values.enumerated() {
                        let r = CGRect(x: CGFloat(i) * bw + bw * 0.15, y: y(v), width: bw * 0.7, height: max(1, H - y(v)))
                        ctx.fill(Path(roundedRect: r, cornerRadius: 1.5), with: .color(color.opacity(0.85)))
                    }
                } else {
                    let vals = values.count == 1 ? [values[0], values[0]] : values
                    let pts = vals.enumerated().map { CGPoint(x: CGFloat($0.offset) / CGFloat(vals.count - 1) * W, y: y($0.element)) }
                    var line = Path()
                    ChartMath.monotone(pts, into: &line)
                    var area = line
                    area.addLine(to: CGPoint(x: W, y: H)); area.addLine(to: CGPoint(x: 0, y: H)); area.closeSubpath()
                    ctx.fill(area, with: .linearGradient(Gradient(colors: [color.opacity(0.22), color.opacity(0)]), startPoint: .zero, endPoint: CGPoint(x: 0, y: H)))
                    ctx.stroke(line, with: .color(color), style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                }
            }
            .frame(height: height)
            .accessibilityLabel("Historique")
        }
    }
}

// MARK: - Jauge et anneau

/// Jauge en arc (`Gauge`) : 3/4 de cercle, trait 6, piste `--border`, ressort à chaque nouvelle valeur.
struct GaugeView: View {
    var value: Double
    var max: Double = 100
    var size: CGFloat = 64
    var stroke: CGFloat = 6
    var color: Color
    var label: String
    var arc: CGFloat = 0.75
    @Environment(\.palette) private var p

    var body: some View {
        let f = CGFloat(Swift.max(0, Swift.min(1, value / (self.max == 0 ? 1 : self.max))))
        let rot = 90 + 360 * (1 - arc) / 2
        ZStack {
            ZStack {
                Circle().trim(from: 0, to: arc).stroke(p.border, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                Circle().trim(from: 0, to: arc * f).stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                    .animation(.spring(response: 0.55, dampingFraction: 0.9), value: f)
            }
            .rotationEffect(.degrees(rot))
            .padding(stroke / 2)
            Text(label).ui(Swift.max(14, Swift.min(22, (size * 0.21).rounded())), .semibold).monospacedDigit()
        }
        .frame(width: size, height: size)
    }
}

/// Anneau de répartition (`Donut`) : segments séparés de 2 pt, piste `--border`, chiffre au centre.
struct DonutView: View {
    struct Segment { var value: Double; var color: Color; var label: String }
    var segments: [Segment]
    var size: CGFloat = 128
    var thickness: CGFloat = 14
    var label: String
    var sub: String?
    var gap: CGFloat = 2
    @Environment(\.palette) private var p
    @State private var shown: CGFloat = 0

    var body: some View {
        let parts = segments.filter { $0.value > 0 }
        let total = Swift.max(1e-9, parts.reduce(0) { $0 + $1.value })
        let r = (size - thickness) / 2, C = 2 * .pi * r
        let gapF = parts.count > 1 && C > 0 ? gap / C : 0
        ZStack {
            Circle().stroke(p.border, lineWidth: thickness).padding(thickness / 2)
            ForEach(Array(parts.enumerated()), id: \.offset) { i, s in
                let off = CGFloat(parts.prefix(i).reduce(0) { $0 + $1.value } / total)
                let len = Swift.max(0.0005, CGFloat(s.value / total) - gapF)
                Circle()
                    .trim(from: Swift.min(off, shown), to: Swift.min(off + len, Swift.max(off, shown)))
                    .stroke(s.color, style: StrokeStyle(lineWidth: thickness, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
                    .padding(thickness / 2)
            }
            VStack(spacing: 4) {
                Text(label).ui(Swift.max(14, Swift.min(26, (size * 0.19).rounded())), .semibold, tracking: -0.025).monospacedDigit()
                    .contentTransition(.numericText())
                if let sub { Text(sub).ui(11.5).foregroundStyle(p.mutedForeground) }
            }
        }
        .frame(width: size, height: size)
        .onAppear { withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.9)) { shown = 1 } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(parts.map { "\($0.label) : \(Int($0.value))" }.joined(separator: ", "))
    }
}

/// Légende (`Legend`) : point de 8, libellé gris, valeur en gras.
struct LegendView: View {
    struct Item { var color: Color; var label: String; var value: String? }
    var items: [Item]
    var vertical = false
    @Environment(\.palette) private var p

    var body: some View {
        let content = ForEach(Array(items.enumerated()), id: \.offset) { _, it in
            HStack(spacing: 6) {
                Circle().fill(it.color).frame(width: 8, height: 8)
                Text(it.label).lineLimit(1)
                if let v = it.value { Text(v).fontWeight(.semibold).foregroundStyle(p.foreground).monospacedDigit().padding(.leading, 2) }
            }
        }
        Group {
            if vertical {
                VStack(alignment: .leading, spacing: 6) { content }
            } else {
                HStack(spacing: 16) { content }
            }
        }
        .ui(12.5)
        .foregroundStyle(p.mutedForeground)
    }
}

// MARK: - Courbe en direct

/// Graphique temps réel (`LiveChart`) : la fenêtre défile en continu (décalage `lag` pour absorber l'arrivée
/// des mesures par paquets), l'échelle suit un maximum « rond », un point pulse au bout de chaque courbe.
struct LiveChart: View {
    struct Series { var data: [Pt]; var color: Color }
    var series: [Series]
    var windowMs: Double = 120_000
    var height: CGFloat = 180
    var format: (Double) -> String = { Fmt.number($0) }
    var minMax: Double = 1
    var grid = 3
    var lag: Double = 1200
    var strokeWidth: CGFloat?
    var threshold: Double?
    var loss = false
    var hold = true
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        TimelineView(.animation(minimumInterval: still ? 1 : 1 / 30, paused: false)) { tl in
            let now = tl.date.timeIntervalSince1970 * 1000 - lag
            let target = scaleMax(now: now)
            let labels = (0..<grid).map { ChartMath.axisText(target * (1 - Double($0) / Double(grid)), format) }
            let gutter = CGFloat(labels.map(\.count).max() ?? 0) * 6.2 + 12
            Canvas { ctx, size in
                draw(ctx, size: size, now: now, target: target, gutter: gutter, labels: labels, phase: tl.date.timeIntervalSinceReferenceDate)
            }
        }
        .frame(height: height)
        .accessibilityLabel("Graphique temps réel")
    }

    private func scaleMax(now: Double) -> Double {
        var target = minMax
        for s in series { for q in s.data where now - q.t < windowMs + 4000 { if let v = q.v, v > target { target = v } } }
        if let threshold, target < threshold * 0.6 { target = max(target, threshold * 0.3) }
        return ChartMath.niceStep(target * 1.08 / Double(grid)) * Double(grid)
    }

    private func draw(_ ctx: GraphicsContext, size: CGSize, now: Double, target: Double, gutter: CGFloat, labels: [String], phase: Double) {
        let W = size.width, H = size.height
        let padT: CGFloat = 16, padB: CGFloat = loss ? 8 : 4, ih = H - padT - padB
        var first = now
        for s in series { if let t = s.data.first?.t, t < first { first = t } }
        let win = min(windowMs, max(15_000, now - first))
        let L = gutter, PW = max(10, W - L)
        func x(_ t: Double) -> CGFloat { L + PW * CGFloat(1 - (now - t) / win) }
        func y(_ v: Double) -> CGFloat { padT + ih * CGFloat(1 - min(1, v / target)) }

        // grille et graduations
        for i in 0..<grid {
            let yy = (padT + ih * CGFloat(i) / CGFloat(grid)).rounded() + 0.5
            ctx.stroke(Path { $0.move(to: CGPoint(x: L, y: yy)); $0.addLine(to: CGPoint(x: W, y: yy)) }, with: .color(p.gridLine), lineWidth: 1)
            let text = Text(labels[i]).font(p.isGeist ? p.font(size: 11).monospacedDigit() : p.font(size: 11)).foregroundColor(p.isGeist ? p.faint : p.mutedForeground)
            ctx.draw(text, at: CGPoint(x: L - 8, y: yy), anchor: .trailing)
        }
        if let threshold, threshold < target {
            let ty = y(threshold).rounded() + 0.5
            ctx.stroke(Path { $0.move(to: CGPoint(x: L, y: ty)); $0.addLine(to: CGPoint(x: W, y: ty)) },
                       with: .color(p.warn.opacity(0.7)), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
        }

        var clipped = ctx
        clipped.clip(to: Path(CGRect(x: L, y: -20, width: W - L, height: H + 40)))
        let cut = now - windowMs - 6000
        let areaTop = p.isGeist ? 0.1 : 0.24
        var dots: [(CGPoint, Color)] = []
        for (i, s) in series.enumerated() {
            var pts: [(CGFloat, CGFloat?)] = s.data.filter { $0.t > cut }.map { (x($0.t), $0.v.map(y)) }
            if loss && i == 0 {
                for q in pts where q.1 == nil && q.0 > L - 4 {
                    clipped.fill(Path(CGRect(x: q.0 - 1.5, y: H - 4, width: 3, height: 4)), with: .color(p.danger))
                }
            }
            // valeur maintenue jusqu'au bord droit (les mesures arrivent par paquets)
            if hold, let end = pts.last, let ey = end.1, end.0 < W { pts.append((W + 1, ey)) }
            var line = Path(), area = Path()
            let segs = ChartMath.segments(pts)
            for var sg in segs {
                if sg.count == 1 { sg.insert(CGPoint(x: sg[0].x - 2, y: sg[0].y), at: 0) }
                ChartMath.monotone(sg, into: &line)
                var a = Path()
                ChartMath.monotone(sg, into: &a)
                a.addLine(to: CGPoint(x: sg.last!.x, y: H)); a.addLine(to: CGPoint(x: sg[0].x, y: H)); a.closeSubpath()
                area.addPath(a)
            }
            clipped.fill(area, with: .linearGradient(Gradient(colors: [s.color.opacity(areaTop), s.color.opacity(0)]), startPoint: CGPoint(x: 0, y: 0), endPoint: CGPoint(x: 0, y: H)))
            clipped.stroke(line, with: .color(s.color), style: StrokeStyle(lineWidth: strokeWidth ?? (p.isGeist ? 1.5 : 2), lineCap: .round, lineJoin: .round))
            if let last = segs.last, let tail = last.last, tail.x >= W - 2 {
                var cy = tail.y
                for j in stride(from: last.count - 1, to: 0, by: -1) where last[j - 1].x <= W && last[j].x >= W {
                    let A = last[j - 1], B = last[j], f = (W - A.x) / (B.x - A.x == 0 ? 1 : B.x - A.x)
                    cy = A.y + (B.y - A.y) * f
                    break
                }
                dots.append((CGPoint(x: min(W - 2, tail.x), y: cy), s.color))
            }
        }
        // point « en direct » et son onde (2,4 s)
        let k = phase.truncatingRemainder(dividingBy: 2.4) / 2.4
        let ease = 1 - pow(1 - k, 4)
        for (pt, color) in dots {
            if !still {
                let r = 3.5 * (1 + 2.2 * ease)
                ctx.fill(Path(ellipseIn: CGRect(x: pt.x - r, y: pt.y - r, width: r * 2, height: r * 2)), with: .color(color.opacity(0.5 * (1 - ease))))
            }
            var glow = ctx
            glow.addFilter(.shadow(color: color, radius: 4))
            glow.fill(Path(ellipseIn: CGRect(x: pt.x - 3.5, y: pt.y - 3.5, width: 7, height: 7)), with: .color(color))
        }
    }
}

// MARK: - Présence

/// Frise de présence sur 24 h (`PresenceTimeline`).
struct PresenceTimeline: View {
    struct RowData: Identifiable { var id: String; var icon: String; var name: String; var segs: [(Double, Double, Bool)]; var label: String }
    var rows: [RowData]
    var from: Double
    var to: Double
    @Environment(\.palette) private var p

    private func pct(_ t: Double) -> CGFloat { CGFloat(max(0, min(1, (t - from) / (to - from == 0 ? 1 : to - from)))) }

    var body: some View {
        let now = Date().timeIntervalSince1970 * 1000
        let step = 3 * 3600_000.0
        let ticks = stride(from: (from / step).rounded(.up) * step, to: to, by: step).map { $0 }
        VStack(spacing: 10) {
            ForEach(rows) { row in
                HStack(spacing: 14) {
                    HStack(spacing: 8) {
                        LucideIcon(row.icon, size: 14).foregroundStyle(p.mutedForeground)
                        Text(row.name).lineLimit(1)
                    }
                    .frame(width: 96, alignment: .leading)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: p.isGeist ? 4 : 5).fill(p.isGeist ? p.foreground.opacity(0.05) : p.muted)
                            ForEach(Array(row.segs.enumerated()), id: \.offset) { _, sg in
                                let l = pct(sg.0), w = max(0.004, pct(sg.1) - l)
                                RoundedRectangle(cornerRadius: 3).fill(sg.2 ? p.ok : p.brand)
                                    .frame(width: max(2, w * g.size.width)).padding(.vertical, 3).offset(x: l * g.size.width)
                            }
                            if now < to {
                                Rectangle().fill(p.danger.opacity(0.7)).frame(width: 1.5).offset(x: pct(now) * g.size.width)
                            }
                        }
                    }
                    .frame(height: p.isGeist ? 16 : 18)
                }
                .ui(13.5)
            }
            HStack(spacing: 14) {
                Color.clear.frame(width: 96, height: 1)
                GeometryReader { g in
                    ForEach(ticks, id: \.self) { t in
                        let x = pct(t)
                        // cadre de largeur nulle : l'heure est centrée sur son repère (calée à gauche / à droite aux bords)
                        Text("\(Calendar.current.component(.hour, from: Date(timeIntervalSince1970: t / 1000))) h")
                            .ui(11).monospacedDigit().foregroundStyle(p.mutedForeground).fixedSize()
                            .frame(width: 0, alignment: x < 0.04 ? .leading : x > 0.96 ? .trailing : .center)
                            .offset(x: x * g.size.width)
                    }
                }
                .frame(height: 14)
            }
        }
    }
}
