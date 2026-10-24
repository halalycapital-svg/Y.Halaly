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
    @State private var apiKey = Keychain.apiKey ?? ""

    private static let days: [(id: String, label: String)] = [
        ("sunday", "א׳"), ("monday", "ב׳"), ("tuesday", "ג׳"), ("wednesday", "ד׳"),
        ("thursday", "ה׳"), ("friday", "ו׳"), ("saturday", "ש׳"),
    ]

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            Form {
                Section {
                    DatePicker("שעה", selection: timeBinding, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .frame(maxWidth: .infinity)
                    Toggle("השעון פעיל", isOn: $store.settings.isEnabled)
                }

                Section("ימים (ריק = פעם אחת)") {
                    HStack {
                        ForEach(Self.days, id: \.id) { day in
                            let on = store.settings.weekdays.contains(day.id)
                            Button(day.label) {
                                if on { store.settings.weekdays.remove(day.id) } else { store.settings.weekdays.insert(day.id) }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(on ? .teal : .gray.opacity(0.4))
                        }
                    }
                }

                Section("כדי לכבות צריך תמונה עם:") {
                    Label("פנים מול המראה", systemImage: "person.crop.square")
                    Label("מברשת שיניים בפה", systemImage: "mouth")
                    Label("שיער רטוב", systemImage: "drop.fill")
                    Stepper("מצלצל שוב אחרי \(store.settings.nagMinutes) דק׳", value: $store.settings.nagMinutes, in: 1...10)
                }

                Section {
                    SecureField("sk-ant-...", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Keychain.apiKey = apiKey }
                        .onChange(of: apiKey) { Keychain.apiKey = apiKey }
                } header: {
                    Text("מפתח Anthropic API")
                } footer: {
                    Text("נשמר רק ב-Keychain של המכשיר. משמש לבדיקת התמונה.")
                }

                if let last = store.lastSuccess {
                    Section {
                        Label("צחצוח אחרון שאומת: \(last.formatted(date: .abbreviated, time: .shortened))",
                              systemImage: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("צחצוח או כלום 🪥")
            .onChange(of: store.settings) { Task { await AlarmController.shared.syncMainAlarm() } }
        }
    }

    private var timeBinding: Binding<Date> {
        Binding {
            Calendar.current.date(from: DateComponents(hour: store.settings.hour, minute: store.settings.minute)) ?? .now
        } set: { date in
            let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
            store.settings.hour = parts.hour ?? 7
            store.settings.minute = parts.minute ?? 0
        }
    }
}
