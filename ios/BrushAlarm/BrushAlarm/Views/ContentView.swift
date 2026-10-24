import SwiftUI

struct ContentView: View {
    @Environment(AlarmStore.self) private var store

    var body: some View {
        if store.awaitingProof {
            VerifyView()
        } else {
            SettingsView()
        }
    }
}

private struct SettingsView: View {
    @Environment(AlarmStore.self) private var store

    var body: some View {
        @Bindable var store = store
        VStack(spacing: 24) {
            Text("צחצוח או כלום 🪥").font(.largeTitle.bold())

            DatePicker("שעה", selection: timeBinding, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel)
                .labelsHidden()

            Toggle("השעון פעיל", isOn: $store.isEnabled)
                .font(.title3)
                .padding(.horizontal, 40)

            Text("כדי לכבות: תצלם את עצמך מול המראה עם מברשת בפה.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
        .onChange(of: store.isEnabled) { resync() }
        .onChange(of: store.hour) { resync() }
        .onChange(of: store.minute) { resync() }
    }

    private func resync() {
        Task { await AlarmController.shared.syncMainAlarm() }
    }

    private var timeBinding: Binding<Date> {
        Binding {
            Calendar.current.date(from: DateComponents(hour: store.hour, minute: store.minute)) ?? .now
        } set: { date in
            let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
            store.hour = parts.hour ?? 7
            store.minute = parts.minute ?? 0
        }
    }
}
