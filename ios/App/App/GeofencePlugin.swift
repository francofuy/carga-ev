// Puente Capacitor <-> HomeGeofenceManager. Mismo patrón que LiveActivityPlugin.swift: código
// propio en el target App, se registra a mano en MainViewController.capacitorDidLoad().
import Foundation
import Capacitor
import CoreLocation

@objc(GeofencePlugin)
public class GeofencePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GeofencePlugin"
    public let jsName = "Geofence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startMonitoringHome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isMonitoring", returnType: CAPPluginReturnPromise),
    ]

    @objc func startMonitoringHome(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"), let lng = call.getDouble("lng") else {
            call.reject("Faltan latitud/longitud.")
            return
        }
        guard CLLocationManager.locationServicesEnabled() else {
            call.reject("Los servicios de ubicación están desactivados en el dispositivo.")
            return
        }
        HomeGeofenceManager.shared.startMonitoring(latitude: lat, longitude: lng)
        call.resolve()
    }

    @objc func stopMonitoring(_ call: CAPPluginCall) {
        HomeGeofenceManager.shared.stopMonitoring()
        call.resolve()
    }

    @objc func isMonitoring(_ call: CAPPluginCall) {
        call.resolve(["value": HomeGeofenceManager.shared.isMonitoring()])
    }
}
