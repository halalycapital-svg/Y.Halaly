import SwiftUI

/// Shown whenever an alarm is waiting for proof. The only way out is a passing photo.
struct VerifyView: View {
    @State private var showCamera = false
    @State private var photo: UIImage?
    @State private var isChecking = false
    @State private var message: String?
    @State private var verdict: Verdict?

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("🪥💧🪞").font(.system(size: 64))
            Text("השעון לא ייכבה עד שתוכיח")
                .font(.title.bold())
            Text("לך למראה, תרטיב את השיער, מברשת בפה, ותצלם.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 260)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }

            if let verdict { ChecklistView(verdict: verdict) }

            if let message {
                Text(message)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(verdict?.passed == true ? .green : .red)
            }

            Spacer()

            Button {
                showCamera = true
            } label: {
                Label(isChecking ? "בודק…" : "צלם הוכחה", systemImage: "camera.fill")
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity, minHeight: 56)
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
            .disabled(isChecking)
        }
        .padding()
        .overlay { if isChecking { ProgressView().controlSize(.large) } }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in Task { await check(image) } }
                .ignoresSafeArea()
        }
        .onAppear { if photo == nil { showCamera = true } }
    }

    private func check(_ image: UIImage) async {
        photo = image
        verdict = nil
        message = nil
        isChecking = true
        defer { isChecking = false }
        do {
            let result = try await PhotoVerifier.verify(image)
            verdict = result
            message = result.reason
            if result.passed {
                try? await Task.sleep(for: .seconds(2))
                AlarmController.shared.proofAccepted()
            }
        } catch {
            message = error.localizedDescription
        }
    }
}

private struct ChecklistView: View {
    let verdict: Verdict

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            row("פנים", verdict.faceVisible)
            row("מראה", verdict.inFrontOfMirror)
            row("מצחצח שיניים", verdict.brushingTeeth)
            row("שיער רטוב", verdict.hairWet)
            row("תמונה אמיתית", verdict.liveScene)
        }
    }

    private func row(_ title: String, _ ok: Bool) -> some View {
        Label(title, systemImage: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
            .foregroundStyle(ok ? .green : .red)
    }
}
