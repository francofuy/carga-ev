// Live Activity real de una carga en Casa — reemplaza el stub del spike de la Fase C (ya
// verificado: el target archiva, se empaqueta y se instala bien en este pipeline sin firma).
// Diseño aprobado en design-lab/mockup-live-activity.html: encabezado con ícono + red, barra de
// progreso por franja de batería (crítico/medio/bueno, mismos umbrales que bandColor() en
// src/screens/inicio.ts), % + kWh, hora de corte.
//
// Nota real de plataforma: a diferencia del wireframe web (que usa una animación CSS de "corriente
// circulando" en loop infinito), una Live Activity NO puede correr una animación continua propia —
// ActivityKit solo repinta cuando la app llama a Activity.update(...) (ver LiveActivityPlugin.swift,
// método "sync"). Lo que sí anima solo, sin intervención de la app: la barra de progreso rellenándose
// suavemente entre un valor y el siguiente, y el countdown de la hora de corte (Text(style: .time)).

import ActivityKit
import SwiftUI
import WidgetKit

// El deployment target de este target (extensión) ya es 16.2 (ver project.yml) — no hace falta
// @available acá, solo en Shared/ChargeActivityAttributes.swift, que también compila contra el
// target App (deployment 15.0).
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
            ProgressView(value: min(max(context.state.pct, 0), 100), total: 100)
                .tint(color)
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
            }
            HStack {
                Text("Desde \(Int(context.attributes.startPct.rounded()))%")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("Corta a las")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                Text(context.attributes.targetStopAt, style: .time)
                    .font(.system(size: 10, weight: .bold))
            }
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
                        ProgressView(value: min(max(context.state.pct, 0), 100), total: 100)
                            .tint(color)
                        HStack {
                            Text(String(format: "%.1f / %.1f kWh", context.state.kwhDelivered, context.state.kwhTotal))
                            Spacer()
                            HStack(spacing: 3) {
                                Text("Corta")
                                Text(context.attributes.targetStopAt, style: .time)
                            }
                        }
                        .font(.system(size: 10.5))
                        .foregroundStyle(.secondary)
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
