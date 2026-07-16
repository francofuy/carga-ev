// Compartido entre el target App y LiveActivityWidget (ver ios/App/project.yml, ambos targets
// incluyen esta misma carpeta "Shared" en sus sources). No hay App Group entre los dos targets
// (bloqueado con Apple ID gratis, ver CLAUDE.md) — no hace falta: ActivityKit es en sí mismo el
// canal de comunicación entre el proceso de la app y el de la extensión, cada uno compila su
// propia copia de este struct, solo tienen que ser estructuralmente idénticas.
import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct ChargeActivityAttributes: ActivityAttributes {
    // Datos fijos durante toda la carga (ActivityKit no permite mutar "attributes" después de
    // Activity.request — solo el ContentState puede actualizarse con .update()).
    var startAt: Date
    var startPct: Double
    var targetStopAt: Date
    var networkLabel: String

    public struct ContentState: Codable, Hashable {
        // Lo único que cambia mientras la carga está en curso.
        var pct: Double
        var kwhDelivered: Double
        var kwhTotal: Double
    }
}
