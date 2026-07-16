// Subclase de CAPBridgeViewController solo para registrar los plugins propios (código directo
// en el target App, no plugins npm/SPM) en el momento correcto. El primer intento de registrar
// LiveActivityPlugin en AppDelegate.didFinishLaunchingWithOptions no funcionó — a esa altura el
// rootViewController todavía puede no estar cargado (su vista se carga recién de forma
// perezosa), así que el `if let ... as? CAPBridgeViewController` fallaba en silencio y el plugin
// nunca quedaba registrado. capacitorDidLoad() es el punto que Capacitor garantiza que corre
// justo después de crear el bridge — Main.storyboard apunta acá en vez de a
// CAPBridgeViewController directamente (ver customClass="MainViewController").
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(GeofencePlugin())
    }
}
