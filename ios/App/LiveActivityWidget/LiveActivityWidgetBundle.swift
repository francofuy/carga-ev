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
// La forma "ondulada" (bobina) del wireframe web quedó simplificada a una barra recta: no pudimos
// probar a tiempo un ProgressViewStyle con forma de onda que además soporte timerInterval — queda
// como mejora visual pendiente, sin afectar la función.

import ActivityKit
import SwiftUI
import WidgetKit

private func bandColor(_ pct: Double) -> Color {
    if pct < 20 { return Color(red: 0.816, green: 0.231, blue: 0.231) } // --critical
    if pct < 80 { return Color(red: 0.980, green: 0.698, blue: 0.098) } // --warning-fill
    return Color(red: 0.129, green: 0.639, blue: 0.373) // --good
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

/**
 * Barra de batería: el tramo hasta el % inicial arranca ya relleno (fijo, no anima — es el % que
 * ya tenía la batería antes de esta carga), y el tramo que sigue lo anima el sistema solo por
 * tiempo transcurrido entre startAt y targetStopAt (sin que la app tenga que estar corriendo).
 * Antes la barra arrancaba siempre vacía, como si la batería estuviera en 0%.
 */
private struct BatteryProgressBar: View {
    var startPct: Double
    var startAt: Date
    var targetStopAt: Date
    var color: Color

    var body: some View {
        GeometryReader { geo in
            let startFrac = min(max(startPct / 100, 0), 1)
            HStack(spacing: 0) {
                Capsule()
                    .fill(color.opacity(0.5))
                    .frame(width: geo.size.width * startFrac)
                if targetStopAt > startAt && startFrac < 1 {
                    ProgressView(timerInterval: startAt...targetStopAt, countsDown: false)
                        .tint(color)
                        .labelsHidden()
                }
            }
            .background(Capsule().fill(color.opacity(0.15)))
            .clipShape(Capsule())
        }
        .frame(height: 6)
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<ChargeActivityAttributes>

    var body: some View {
        let color = bandColor(context.state.pct)
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                ZStack {
                    Circle().fill(color.opacity(0.22))
                    ChargeIcon(color: color)
                }
                .frame(width: 26, height: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Cargando en Casa").font(.system(size: 12.5, weight: .bold))
                    Text(context.attributes.networkLabel).font(.system(size: 10)).foregroundStyle(.secondary)
                }
                Spacer()
            }
            BatteryProgressBar(startPct: context.attributes.startPct, startAt: context.attributes.startAt, targetStopAt: context.attributes.targetStopAt, color: color)
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
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ChargeIcon(color: color)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.pct.rounded()))%")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(color)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("Cargando en Casa").font(.system(size: 11, weight: .semibold))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 5) {
                        BatteryProgressBar(startPct: context.attributes.startPct, startAt: context.attributes.startAt, targetStopAt: context.attributes.targetStopAt, color: color)
                        HStack {
                            Text(String(format: "%.1f/%.1f kWh", totalKwhSoFar(startPct: context.attributes.startPct, kwhTotal: context.state.kwhTotal, kwhDelivered: context.state.kwhDelivered), context.state.kwhTotal))
                            Spacer()
                            Text(context.attributes.targetStopAt, style: .time)
                        }
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    }
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
