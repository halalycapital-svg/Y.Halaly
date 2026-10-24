import SwiftUI

@main
struct BrushAlarmApp: App {
    @State private var store = AlarmStore.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
                .environment(\.layoutDirection, .rightToLeft)
                .task { await AlarmController.shared.bootstrap() }
        }
    }
}
