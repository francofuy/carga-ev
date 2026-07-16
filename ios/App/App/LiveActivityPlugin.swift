// Puente Capacitor <-> ActivityKit para la Live Activity de una carga en Casa. Sin archivo
// Objective-C ni registro manual en AppDelegate: @objc + CAPBridgedPlugin alcanza para que
// Capacitor lo descubra solo (patrón moderno de plugins locales, Capacitor 5+).
//
// "sync" es idempotente a propósito: nueva-carga.ts la llama al programar/empezar una carga, e
// inicio.ts la vuelve a llamar cada vez que repinta la tarjeta "Cargando ahora" (cada ~60s) — acá
// adentro se decide si hay que crear la Activity o solo actualizar el ContentState de la que ya
// existe. Los "attributes" (startPct/targetStopAt/networkLabel) son inmutables una vez creada la
// Activity, pero no cambian durante una misma carga, así que no hace falta detectar diferencias.
import Foundation
import Capacitor
import ActivityKit

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["value": false])
            return
        }
        call.resolve(["value": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Las Live Activities requieren iOS 16.2 o superior.")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Las Live Activities están desactivadas (revisar Ajustes → Carga EV → Live Activities).")
            return
        }
        guard
            let startPct = call.getDouble("startPct"),
            let targetStopAtMs = call.getDouble("targetStopAtMs"),
            let networkLabel = call.getString("networkLabel"),
            let pct = call.getDouble("pct"),
            let kwhDelivered = call.getDouble("kwhDelivered"),
            let kwhTotal = call.getDouble("kwhTotal")
        else {
            call.reject("Faltan parámetros para sincronizar la Live Activity.")
            return
        }
        let state = ChargeActivityAttributes.ContentState(pct: pct, kwhDelivered: kwhDelivered, kwhTotal: kwhTotal)

        // Ya hay una Activity de esta carga en curso: solo se actualiza el contenido.
        if let existing = Activity<ChargeActivityAttributes>.activities.first {
            Task {
                await existing.update(ActivityContent(state: state, staleDate: nil))
                call.resolve(["activityId": existing.id])
            }
            return
        }

        let attributes = ChargeActivityAttributes(
            startPct: startPct,
            targetStopAt: Date(timeIntervalSince1970: targetStopAtMs / 1000),
            networkLabel: networkLabel
        )
        do {
            let activity = try Activity<ChargeActivityAttributes>.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil)
            )
            call.resolve(["activityId": activity.id])
        } catch {
            call.reject("No se pudo iniciar la Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<ChargeActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
