// Live Activity real de una carga en Casa — reemplaza el stub del spike de la Fase C (ya
// verificado: el target archiva, se empaqueta y se instala bien en este pipeline sin firma).
// Diseño aprobado en design-lab/mockup-live-activity.html: encabezado con ícono + red, barra de
// progreso por franja de batería (crítico/medio/bueno, mismos umbrales que bandColor() en
// src/screens/inicio.ts), % + kWh, hora de corte.
//
// Nota real de plataforma (encontrada probando en el dispositivo real): una Live Activity NO se
// actualiza sola — solo repinta cuando la app llama a Activity.update(...) (ver
// LiveActivityPlugin.swift, método "sync"), y esa llamada solo pasa mientras la app está abierta
// en primer plano (el JS del WKWebView no corre en background). Por eso el % quedaba estático al
// minimizar. BatteryProgressBar usa ProgressView(timerInterval:) para el tramo que se agrega en
// esta sesión: esa variante SÍ la anima el sistema solo, sin la app corriendo, interpolando entre
// startAt y targetStopAt — es progreso por TIEMPO transcurrido, no el % real de batería (que no es
// lineal, se achata después del 80%), así que puede no coincidir exacto con el número grande de
// abajo, que sí es el estimado físico real pero solo se refresca cuando la app se abre. El tramo
// hasta el % inicial (lo que la batería ya tenía antes de esta carga) es fijo, no un 0 — antes la
// barra y el "0.0/60.0 kWh" arrancaban siempre como si la batería estuviera vacía.
//
// La forma "ondulada" (bobina) del wireframe web se aplica solo al tramo FIJO (lo que la batería
// ya tenía) — decisión tomada a propósito: reemplazar el ProgressView(timerInterval:) del tramo
// que crece por un Shape/estilo propio arriesgaba perder la animación que el sistema hace solo,
// sin la app corriendo (no hay forma de confirmar eso sin gastar otro ciclo de build). El tramo
// animado se queda como barra recta.
//
// Rediseño de la isla expandida + acento personalizable (design-lab/rediseno-live-activity-y-
// dynamic-island.html, aprobado): la isla expandida tenía 3 puntos de recorte real contra la
// silueta curva (ícono/leading, "%"/trailing, y el VStack entero de .bottom — los 3 sin ningún
// padding). Se resolvió sacando el "%" grande de la zona curva (.trailing solo tiene la hora de
// corte) y llevándolo a .bottom, que es ancho de verdad, con .padding(.horizontal, 20) — antes
// esa región no tenía padding alguno. El acento de personalización (accentColor, calibrado para
// fondo oscuro en personalizacion.ts) pinta solo elementos NEUTROS que hoy no comunican nada por
// sí mismos (fondo del círculo del ícono, track vacío de la barra, hora de corte) — el color de
// batería (bandColor: rojo/ámbar/verde) sigue intacto en el rayo y en el tramo lleno de la barra,
// mismo criterio que ya separa acento de marca de color semántico en el resto de la app.

import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

private func bandColor(_ pct: Double) -> Color {
    if pct < 20 { return Color(red: 0.816, green: 0.231, blue: 0.231) } // --critical
    if pct < 80 { return Color(red: 0.980, green: 0.698, blue: 0.098) } // --warning-fill
    return Color(red: 0.129, green: 0.639, blue: 0.373) // --good
}

/** Celeste histórico (#4FB0F5, calibración oscura del hue=205 default) — fallback si el hex que
    llega desde JS viniera vacío o corrupto. */
private let fallbackAccent = Color(red: 0.310, green: 0.690, blue: 0.961)

private func accentColor(from hex: String) -> Color {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    s.removeAll { $0 == "#" }
    guard s.count == 6, let rgb = UInt64(s, radix: 16) else { return fallbackAccent }
    return Color(
        red: Double((rgb >> 16) & 0xFF) / 255,
        green: Double((rgb >> 8) & 0xFF) / 255,
        blue: Double(rgb & 0xFF) / 255
    )
}

private struct ChargeIcon: View {
    var color: Color
    var body: some View {
        Image(systemName: "bolt.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(color)
    }
}

/** kWh totales ya en la batería (lo que había al empezar + lo entregado en esta sesión) — no
    solo lo entregado, que arrancaba siempre en 0.0 aunque la batería ya tuviera carga. */
private func totalKwhSoFar(startPct: Double, kwhTotal: Double, kwhDelivered: Double) -> Double {
    startPct / 100 * kwhTotal + kwhDelivered
}

/** Curva senoidal — el motivo "bobina" del wireframe, aplicado solo al tramo fijo (ver nota de
    arriba sobre por qué el tramo animado no la usa). */
private struct WaveShape: Shape {
    var amplitude: CGFloat = 2
    var wavelength: CGFloat = 12

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard rect.width > 0 else { return path }
        let midY = rect.midY
        path.move(to: CGPoint(x: rect.minX, y: midY))
        var x: CGFloat = 0
        while x <= rect.width {
            let angle = (x / wavelength) * 2 * .pi
            path.addLine(to: CGPoint(x: rect.minX + x, y: midY + amplitude * sin(angle)))
            x += 2
        }
        return path
    }
}

/**
 * Barra de batería: el tramo hasta el % inicial arranca ya relleno (fijo, con forma de onda — es
 * el % que ya tenía la batería antes de esta carga), y el tramo que sigue lo anima el sistema
 * solo por tiempo transcurrido entre startAt y targetStopAt (sin que la app tenga que estar
 * corriendo), como barra recta. Antes la barra arrancaba siempre vacía, como si la batería
 * estuviera en 0%.
 *
 * El relleno (`color`) sigue siendo bandColor() — señal real de cuánta batería falta, no se toca.
 * El track vacío (`trackColor`) es el único elemento de esta barra que sigue el acento de
 * personalización en vez del color de batería — es decorativo, no comunica estado por sí mismo.
 */
private struct BatteryProgressBar: View {
    var startPct: Double
    var startAt: Date
    var targetStopAt: Date
    var color: Color
    var trackColor: Color

    var body: some View {
        GeometryReader { geo in
            let startFrac = min(max(startPct / 100, 0), 1)
            HStack(spacing: 0) {
                if startFrac > 0 {
                    WaveShape()
                        .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .frame(width: geo.size.width * startFrac)
                }
                if targetStopAt > startAt && startFrac < 1 {
                    ProgressView(timerInterval: startAt...targetStopAt, countsDown: false)
                        .tint(color)
                        .labelsHidden()
                }
            }
            .frame(height: 10)
            .background(Capsule().fill(trackColor.opacity(0.2)))
        }
        .frame(height: 10)
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<ChargeActivityAttributes>

    var body: some View {
        let color = bandColor(context.state.pct)
        let accent = accentColor(from: context.attributes.accentColor)
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                ZStack {
                    Circle().fill(accent.opacity(0.3))
                    ChargeIcon(color: color)
                }
                .frame(width: 26, height: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Cargando en Casa").font(.system(size: 12.5, weight: .bold))
                    Text(context.attributes.networkLabel).font(.system(size: 10)).foregroundStyle(.secondary)
                }
                Spacer()
            }
            BatteryProgressBar(startPct: context.attributes.startPct, startAt: context.attributes.startAt, targetStopAt: context.attributes.targetStopAt, color: color, trackColor: accent)
            HStack(alignment: .lastTextBaseline) {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("\(Int(context.state.pct.rounded()))").font(.system(size: 25, weight: .bold))
                    Text("%").font(.system(size: 12)).foregroundStyle(.secondary)
                    Text("estimado").font(.system(size: 10)).foregroundStyle(.secondary.opacity(0.7))
                }
                Spacer()
                Text(String(format: "%.1f / %.1f kWh", totalKwhSoFar(startPct: context.attributes.startPct, kwhTotal: context.state.kwhTotal, kwhDelivered: context.state.kwhDelivered), context.state.kwhTotal))
                    .font(.system(size: 10.5))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            HStack {
                Text("Desde \(Int(context.attributes.startPct.rounded()))%")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("Corta")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                Text(context.attributes.targetStopAt, style: .time)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(accent)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.85)
        }
        .padding(14)
        .activityBackgroundTint(Color.black)
        .activitySystemActionForegroundColor(Color.white)
    }
}

struct ChargeLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ChargeActivityAttributes.self) { context in
            LockScreenView(context: context)
        } dynamicIsland: { context in
            let color = bandColor(context.state.pct)
            let accent = accentColor(from: context.attributes.accentColor)
            return DynamicIsland {
                // Antes el ícono (.leading) y el "%" grande (.trailing) quedaban pegados contra la
                // curva de la isla, sin ningún padding — se recortaban ahí. Ahora .trailing solo
                // tiene la hora de corte (texto corto, con margen real) y el "%" se movió a
                // .bottom, la única región que de verdad es ancha.
                DynamicIslandExpandedRegion(.leading) {
                    ChargeIcon(color: color)
                        .padding(.leading, 10)
                        .padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.targetStopAt, style: .time)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(accent)
                        .padding(.trailing, 12)
                        .padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("Casa")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // .padding(.horizontal, 20) acá es el fix real: esta región no tenía NINGÚN
                    // padding antes, y el "kWh" quedaba flush contra el borde izquierdo — el
                    // segundo punto de recorte que reportaste, además del ícono/%.
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .lastTextBaseline) {
                            HStack(alignment: .lastTextBaseline, spacing: 3) {
                                Text("\(Int(context.state.pct.rounded()))").font(.system(size: 24, weight: .bold))
                                Text("%").font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(String(format: "%.1f/%.1f kWh", totalKwhSoFar(startPct: context.attributes.startPct, kwhTotal: context.state.kwhTotal, kwhDelivered: context.state.kwhDelivered), context.state.kwhTotal))
                                .font(.system(size: 10.5))
                                .foregroundStyle(.secondary)
                        }
                        BatteryProgressBar(startPct: context.attributes.startPct, startAt: context.attributes.startAt, targetStopAt: context.attributes.targetStopAt, color: color, trackColor: accent)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
                }
            } compactLeading: {
                ChargeIcon(color: color)
            } compactTrailing: {
                Text("\(Int(context.state.pct.rounded()))%")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(color)
            } minimal: {
                ChargeIcon(color: color)
            }
        }
    }
}

@main
struct LiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        ChargeLiveActivityWidget()
    }
}
