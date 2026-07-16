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
// minimizar. La barra de progreso usa ProgressView(timerInterval:) en vez de un valor fijo: esa
// variante SÍ la anima el sistema solo, sin la app corriendo, interpolando entre startAt y
// targetStopAt — es progreso por TIEMPO transcurrido, no el % real de batería (que no es lineal,
// se achata después del 80%), así que puede no coincidir exacto con el número grande de abajo,
// que sí es el estimado físico real pero solo se refresca cuando la app se abre.
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

/** Barra que el sistema anima solo entre dos fechas (sin que la app tenga que estar corriendo). */
private struct TimeProgressBar: View {
    var startAt: Date
    var targetStopAt: Date
    var color: Color
    var body: some View {
        if targetStopAt > startAt {
            ProgressView(timerInterval: startAt...targetStopAt, countsDown: false)
                .tint(color)
                .labelsHidden()
        } else {
            ProgressView(value: 1, total: 1).tint(color)
        }
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
            TimeProgressBar(startAt: context.attributes.startAt, targetStopAt: context.attributes.targetStopAt, color: color)
            HStack(alignment: .lastTextBaseline) {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("\(Int(context.state.pct.rounded()))").font(.system(size: 25, weight: .bold))
                    Text("%").font(.system(size: 12)).foregroundStyle(.secondary)
                    Text("estimado").font(.system(size: 10)).foregroundStyle(.secondary.opacity(0.7))
                }
                Spacer()
                Text(String(format: "%.1f / %.1f kWh", context.state.kwhDelivered, context.state.kwhTotal))
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
                        TimeProgressBar(startAt: context.attributes.startAt, targetStopAt: context.attributes.targetStopAt, color: color)
                        HStack {
                            Text(String(format: "%.1f/%.1f kWh", context.state.kwhDelivered, context.state.kwhTotal))
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
