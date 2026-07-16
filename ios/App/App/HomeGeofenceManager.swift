// Fase D: monitoreo de la región circular alrededor de "Ubicación de Casa" (guardada en
// Ajustes) y aviso al entrar. Nunca probado bajo firma de AltServer con Apple ID gratis — es la
// parte del proyecto con menos garantías: ni el navegador ni Codemagic pueden confirmar que el
// modo background de ubicación funcione de verdad, solo caminar hasta la ubicación real.
import CoreLocation
import UserNotifications

private let homeRegionIdentifier = "com.francofuy.cargaev.home"
private let arrivalNotificationId = "cargaev-geofence-arrival"

class HomeGeofenceManager: NSObject, CLLocationManagerDelegate {
    static let shared = HomeGeofenceManager()

    private let locationManager = CLLocationManager()
    private var pendingCoordinate: CLLocationCoordinate2D?

    private override init() {
        super.init()
        locationManager.delegate = self
    }

    func startMonitoring(latitude: Double, longitude: Double) {
        pendingCoordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        if locationManager.authorizationStatus == .authorizedAlways {
            beginMonitoring()
        } else {
            // Si todavía no se pidió ni "al usar la app", iOS pide ese primero y recién en una
            // apertura futura ofrece "Siempre" — locationManagerDidChangeAuthorization reintenta
            // beginMonitoring() en cuanto el status realmente pase a authorizedAlways.
            locationManager.requestAlwaysAuthorization()
        }
    }

    func stopMonitoring() {
        pendingCoordinate = nil
        for region in locationManager.monitoredRegions where region.identifier == homeRegionIdentifier {
            locationManager.stopMonitoring(for: region)
        }
    }

    func isMonitoring() -> Bool {
        locationManager.monitoredRegions.contains { $0.identifier == homeRegionIdentifier }
    }

    private func beginMonitoring() {
        guard let coordinate = pendingCoordinate else { return }
        let region = CLCircularRegion(center: coordinate, radius: 150, identifier: homeRegionIdentifier)
        region.notifyOnEntry = true
        region.notifyOnExit = false
        locationManager.startMonitoring(for: region)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedAlways && pendingCoordinate != nil {
            beginMonitoring()
        }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == homeRegionIdentifier else { return }
        let content = UNMutableNotificationContent()
        content.title = "Llegaste a Casa"
        content.body = "¿Programamos la carga?"
        content.userInfo = ["openProgramar": true]
        content.sound = .default
        let request = UNNotificationRequest(identifier: arrivalNotificationId, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
