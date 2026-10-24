import Foundation
import Observation

/// User settings + "is there an alarm waiting for proof" state, persisted in UserDefaults.
/// App intents run in the app's process, so they read/write the same store.
@MainActor
@Observable
final class AlarmStore {
    static let shared = AlarmStore()

    struct Settings: Codable, Equatable {
        var hour = 7
        var minute = 0
        var isEnabled = false
        /// Locale.Weekday raw values ("sunday", "monday", ...). Empty = one-off alarm.
        var weekdays: Set<String> = ["sunday", "monday", "tuesday", "wednesday", "thursday"]
        /// Minutes until the alarm rings again if dismissed without proof.
        var nagMinutes = 2
    }

    var settings: Settings { didSet { save() } }
    /// True from the moment the alarm rings until a photo passes verification.
    var awaitingProof: Bool { didSet { defaults.set(awaitingProof, forKey: Keys.awaiting) } }
    var mainAlarmID: UUID? { didSet { defaults.set(mainAlarmID?.uuidString, forKey: Keys.mainID) } }
    var nagAlarmIDs: [UUID] { didSet { defaults.set(nagAlarmIDs.map(\.uuidString), forKey: Keys.nagIDs) } }
    var lastSuccess: Date? { didSet { defaults.set(lastSuccess, forKey: Keys.lastSuccess) } }

    private let defaults = UserDefaults.standard
    private enum Keys {
        static let settings = "settings", awaiting = "awaitingProof", mainID = "mainAlarmID"
        static let nagIDs = "nagAlarmIDs", lastSuccess = "lastSuccess"
    }

    private init() {
        if let data = defaults.data(forKey: Keys.settings),
           let decoded = try? JSONDecoder().decode(Settings.self, from: data) {
            settings = decoded
        } else {
            settings = Settings()
        }
        awaitingProof = defaults.bool(forKey: Keys.awaiting)
        mainAlarmID = defaults.string(forKey: Keys.mainID).flatMap(UUID.init)
        nagAlarmIDs = (defaults.stringArray(forKey: Keys.nagIDs) ?? []).compactMap(UUID.init)
        lastSuccess = defaults.object(forKey: Keys.lastSuccess) as? Date
    }

    private func save() {
        if let data = try? JSONEncoder().encode(settings) { defaults.set(data, forKey: Keys.settings) }
    }
}
