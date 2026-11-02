import WidgetKit
import SwiftUI
import AppIntents

// Prototype widget. Before device distribution, configure an App Group on
// both the app and widget target, and bridge these events to the app journal.
private enum JoyStorage {
    static let suite = "group.com.littlejoys.app"
    static func count(_ type: String) -> Int {
        UserDefaults(suiteName: suite)?.integer(forKey: "joys.\(type).\(dayKey)") ?? 0
    }
    static var dayKey: String {
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"; return fmt.string(from: Date())
    }
    static func add(_ type: String) {
        guard let prefs = UserDefaults(suiteName: suite) else { return }
        let key = "joys.\(type).\(dayKey)"
        prefs.set(prefs.integer(forKey: key) + 1, forKey: key)
        WidgetCenter.shared.reloadAllTimelines()
    }
}

struct LogLaughIntent: AppIntent {
    static var title: LocalizedStringResource = "I laughed"
    static var description = IntentDescription("Save a little laugh from the widget.")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
        JoyStorage.add("laugh")
        return .result()
    }
}
struct LogHappyIntent: AppIntent {
    static var title: LocalizedStringResource = "I felt happy"
    static var description = IntentDescription("Save a happy moment from the widget.")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
        JoyStorage.add("happy")
        return .result()
    }
}

struct JoyEntry: TimelineEntry {
    let date: Date
    let laughs: Int
    let happy: Int
}
struct JoyProvider: TimelineProvider {
    func placeholder(in context: Context) -> JoyEntry { JoyEntry(date: Date(), laughs: 2, happy: 3) }
    func getSnapshot(in context: Context, completion: @escaping (JoyEntry) -> Void) {
        completion(JoyEntry(date: Date(), laughs: JoyStorage.count("laugh"), happy: JoyStorage.count("happy")))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<JoyEntry>) -> Void) {
        let e = JoyEntry(date: Date(), laughs: JoyStorage.count("laugh"), happy: JoyStorage.count("happy"))
        completion(Timeline(entries: [e], policy: .after(Calendar.current.startOfDay(for: Date()).addingTimeInterval(86400))))
    }
}

struct LittleJoysWidgetView: View {
    var entry: JoyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("little joys").font(.headline); Spacer(); Text("(:").font(.title2) }
            HStack(spacing: 7) {
                Button(intent: LogLaughIntent()) { Text("☀︎ I laughed").font(.caption).bold().frame(maxWidth: .infinity).padding(.vertical, 10) }
                    .buttonStyle(.plain).background(Color(red: 1, green: 0.88, blue: 0.56), in: RoundedRectangle(cornerRadius: 12))
                Button(intent: LogHappyIntent()) { Text("♡ I'm happy").font(.caption).bold().frame(maxWidth: .infinity).padding(.vertical, 10) }
                    .buttonStyle(.plain).background(Color(red: 1, green: 0.90, blue: 0.75), in: RoundedRectangle(cornerRadius: 12))
            }
            Text("Today: \(entry.laughs) laughs · \(entry.happy) happy moments")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(12)
        .containerBackground(Color(red: 1, green: 0.985, blue: 0.945), for: .widget)
    }
}

struct LittleJoysWidget: Widget {
    let kind = "LittleJoysWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: JoyProvider()) { entry in
            LittleJoysWidgetView(entry: entry)
        }
        .configurationDisplayName("Little Joys")
        .description("Keep the little things close.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct LittleJoysWidgetBundle: WidgetBundle {
    var body: some Widget { LittleJoysWidget() }
}
