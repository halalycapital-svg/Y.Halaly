import SwiftUI

/// Shown whenever an alarm is waiting for proof. The only way out is a passing photo.
struct VerifyView: View {
    @State private var showCamera = false
    @State private var photo: UIImage?
    @State private var isChecking = false
    @State private var message: String?
    @State private var passed = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("🪥🪞").font(.system(size: 64))
            Text("השעון לא ייכבה עד שתוכיח").font(.title.bold())
            Text("לך למראה, מברשת בפה, ותצלם.").foregroundStyle(.secondary)

            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }

            if let message {
                Text(message)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(passed ? .green : .red)
            }

            Spacer()

            Button {
                showCamera = true
            } label: {
                Label("צלם הוכחה", systemImage: "camera.fill")
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity, minHeight: 56)
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
            .disabled(isChecking || passed)
        }
        .padding()
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in Task { await check(image) } }
                .ignoresSafeArea()
        }
        .onAppear { if photo == nil { showCamera = true } }
    }

    private func check(_ image: UIImage) async {
        photo = image
        isChecking = true
        defer { isChecking = false }
        switch await PhotoVerifier.verify(image) {
        case .passed:
            passed = true
            message = "יפה! בוקר טוב ☀️"
            try? await Task.sleep(for: .seconds(1.5))
            AlarmController.shared.proofAccepted()
        case .failed(let reason):
            message = reason
        }
    }
}
