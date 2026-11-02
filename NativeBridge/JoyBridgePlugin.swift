import Foundation
import Capacitor
import WidgetKit

@objc(JoyBridgePlugin)
public class JoyBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "JoyBridgePlugin"
    public let jsName = "JoyBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCounts", returnType: CAPPluginReturnPromise)
    ]
    private let suite = "group.com.littlejoys.app"
    private let eventsKey = "joys.events.v1"
    @objc func getEvents(_ call: CAPPluginCall) {
        let events = UserDefaults(suiteName: suite)?.array(forKey: eventsKey) as? [[String: String]] ?? []
        call.resolve(["events": events])
    }
    @objc func ackEvents(_ call: CAPPluginCall) {
        guard let ids = call.getArray("ids", String.self) else {call.reject("Missing ids");return}
        let idSet = Set(ids)
        guard let prefs = UserDefaults(suiteName: suite) else {call.reject("App Group not available");return}
        let events = prefs.array(forKey: eventsKey) as? [[String: String]] ?? []
        prefs.set(events.filter{ !idSet.contains($0["id"] ?? "") }, forKey: eventsKey)
        call.resolve()
    }
    @objc func setCounts(_ call: CAPPluginCall) {
        guard let prefs = UserDefaults(suiteName: suite) else {call.reject("App Group not available");return}
        let formatter = DateFormatter();formatter.dateFormat="yyyy-MM-dd"
        let date = formatter.string(from: Date())
        let pending = prefs.array(forKey: eventsKey) as? [[String:String]] ?? []
        let todayEvents = pending.filter { ($0["timestamp"] ?? "").hasPrefix(date) }
        let laughs = todayEvents.filter{$0["type"] == "laugh"}.count
        let happy = todayEvents.filter{$0["type"] == "joy"}.count
        prefs.set((call.getInt("laugh") ?? 0) + laughs, forKey: "joys.laugh.\(date)")
        prefs.set((call.getInt("joy") ?? 0) + happy, forKey: "joys.happy.\(date)")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
