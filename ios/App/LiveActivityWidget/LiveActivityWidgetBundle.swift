// Spike de la Fase C: target casi vacío, solo para confirmar que un Widget Extension
// con Live Activities archiva y empaqueta bien sin firma real de Apple a través del
// mismo pipeline de Codemagic ya verificado en la Fase A. El diseño real (bobina,
// franjas de color por % de batería, datos en vivo desde la app) se escribe recién
// después de instalar esto en un iPhone real y confirmar que aparece.

import ActivityKit
import SwiftUI
import WidgetKit

struct SpikeActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var placeholder: String
    }

    var placeholder: String
}

struct SpikeLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SpikeActivityAttributes.self) { context in
            Text("Carga EV — spike")
                .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    Text("Carga EV — spike")
                }
            } compactLeading: {
                Text("⚡")
            } compactTrailing: {
                Text("")
            } minimal: {
                Text("⚡")
            }
        }
    }
}

@main
struct LiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        SpikeLiveActivityWidget()
    }
}
