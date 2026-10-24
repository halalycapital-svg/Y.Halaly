import Foundation
import Observation

/// Alarm time + "is there an alarm waiting for proof" state, persisted in UserDefaults.
/// App intents run in the app's process, so they read/write the same store.
@MainActor
@Observable
final class AlarmStore {
    static let shared = AlarmStore()

    var hour: Int { didSet { defaults.set(hour, forKey: "hour") } }
    var minute: Int { didSet { defaults.set(minute, forKey: "minute") } }
    var isEnabled: Bool { didSet { defaults.set(isEnabled, forKey: "isEnabled") } }
    /// True from the moment the alarm is dismissed until a photo passes.
    var awaitingProof: Bool { didSet { defaults.set(awaitingProof, forKey: "awaitingProof") } }
    var mainAlarmID: UUID? { didSet { defaults.set(mainAlarmID?.uuidString, forKey: "mainAlarmID") } }
    var nagAlarmIDs: [UUID] { didSet { defaults.set(nagAlarmIDs.map(\.uuidString), forKey: "nagAlarmIDs") } }

    private let defaults = UserDefaults.standard

    private init() {
        hour = defaults.object(forKey: "hour") as? Int ?? 7
        minute = defaults.integer(forKey: "minute")
        isEnabled = defaults.bool(forKey: "isEnabled")
        awaitingProof = defaults.bool(forKey: "awaitingProof")
        mainAlarmID = defaults.string(forKey: "mainAlarmID").flatMap(UUID.init)
        nagAlarmIDs = (defaults.stringArray(forKey: "nagAlarmIDs") ?? []).compactMap(UUID.init)
    }
}
