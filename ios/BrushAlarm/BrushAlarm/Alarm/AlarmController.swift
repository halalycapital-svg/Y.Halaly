import AlarmKit
import Foundation
import SwiftUI

struct BrushAlarmMetadata: AlarmMetadata {}

/// Owns all AlarmKit scheduling.
///
/// The trick that makes the alarm "un-dismissable": every way out of the ringing alert
/// (Stop, or the "take photo" button) runs an intent that schedules a new alarm a couple
/// of minutes later. Only a verified photo cancels that chain.
@MainActor
final class AlarmController {
    static let shared = AlarmController()

    private let manager = AlarmManager.shared
    private var store: AlarmStore { .shared }

    func bootstrap() async {
        _ = await requestAuthorization()
        await syncMainAlarm()
    }

    func requestAuthorization() async -> Bool {
        switch manager.authorizationState {
        case .authorized: return true
        case .denied: return false
        default: return (try? await manager.requestAuthorization()) == .authorized
        }
    }

    /// Cancels and re-creates the main alarm from the current settings.
    func syncMainAlarm() async {
        if let id = store.mainAlarmID {
            try? manager.cancel(id: id)
            store.mainAlarmID = nil
        }
        let settings = store.settings
        guard settings.isEnabled, await requestAuthorization() else { return }

        let time = Alarm.Schedule.Relative.Time(hour: settings.hour, minute: settings.minute)
        let weekdays = settings.weekdays.compactMap(Locale.Weekday.init(rawValue:))
        let recurrence: Alarm.Schedule.Relative.Recurrence = weekdays.isEmpty ? .never : .weekly(weekdays)
        let schedule = Alarm.Schedule.relative(.init(time: time, repeats: recurrence))

        let id = UUID()
        do {
            try await manager.schedule(id: id, configuration: configuration(schedule: schedule, isNag: false))
            store.mainAlarmID = id
        } catch {
            print("Failed to schedule main alarm: \(error)")
        }
    }

    /// Called whenever the ringing alert is dismissed. Arms the next ring unless proof was given.
    func alarmDismissed(graceMinutes: Int? = nil) async {
        store.awaitingProof = true
        let minutes = graceMinutes ?? store.settings.nagMinutes
        let fireDate = Date().addingTimeInterval(TimeInterval(max(minutes, 1) * 60))
        let id = UUID()
        do {
            try await manager.schedule(id: id, configuration: configuration(schedule: .fixed(fireDate), isNag: true))
            store.nagAlarmIDs.append(id)
        } catch {
            print("Failed to schedule nag alarm: \(error)")
        }
    }

    /// Photo passed: stop the nagging chain.
    func proofAccepted() {
        for id in store.nagAlarmIDs { try? manager.cancel(id: id) }
        store.nagAlarmIDs = []
        store.awaitingProof = false
        store.lastSuccess = .now
    }

    private func configuration(schedule: Alarm.Schedule, isNag: Bool) -> AlarmManager.AlarmConfiguration<BrushAlarmMetadata> {
        let stop = AlarmButton(text: "עצור", textColor: .white, systemImageName: "stop.fill")
        let photo = AlarmButton(text: "צלם הוכחה", textColor: .black, systemImageName: "camera.fill")
        let alert = AlarmPresentation.Alert(
            title: isNag ? "עדיין לא צחצחת 😤" : "בוקר טוב! למראה 🪥",
            stopButton: stop,
            secondaryButton: photo,
            secondaryButtonBehavior: .custom
        )
        let attributes = AlarmAttributes<BrushAlarmMetadata>(
            presentation: AlarmPresentation(alert: alert),
            tintColor: .teal
        )
        return AlarmManager.AlarmConfiguration(
            schedule: schedule,
            attributes: attributes,
            stopIntent: RingAgainIntent(),
            secondaryIntent: OpenCameraIntent(),
            sound: .default
        )
    }
}
