import AppIntents

/// Runs when the user taps "Stop" without proof: the alarm comes back in a few minutes.
struct RingAgainIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "הזכר שוב"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await AlarmController.shared.alarmDismissed()
        return .result()
    }
}

/// Runs from the "take photo" button: opens the app on the camera, with a short grace
/// period before the alarm rings again (in case the user goes back to bed instead).
struct OpenCameraIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "צלם הוכחה"
    static let isDiscoverable = false
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        await AlarmController.shared.alarmDismissed(graceMinutes: 3)
        return .result()
    }
}
