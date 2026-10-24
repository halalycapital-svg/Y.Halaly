import UIKit
import Vision

/// Free, fully on-device check: a face is visible and a hand is up at the mouth (brushing).
enum PhotoVerifier {
    enum Result {
        case passed
        case failed(String)
    }

    static func verify(_ image: UIImage) async -> Result {
        guard let cgImage = image.cgImage else { return .failed("לא הצלחתי לקרוא את התמונה.") }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)

        return await Task.detached {
            let faceRequest = VNDetectFaceRectanglesRequest()
            let handRequest = VNDetectHumanHandPoseRequest()
            handRequest.maximumHandCount = 2

            do {
                try VNImageRequestHandler(cgImage: cgImage, orientation: orientation)
                    .perform([faceRequest, handRequest])
            } catch {
                return .failed("הבדיקה נכשלה, נסה שוב.")
            }

            guard let face = faceRequest.results?.max(by: { $0.boundingBox.area < $1.boundingBox.area }) else {
                return .failed("לא רואים פנים. תעמוד מול המראה.")
            }
            let hands = handRequest.results ?? []
            guard hands.contains(where: { isAtMouth($0, face: face.boundingBox) }) else {
                return .failed("לא רואים יד עם מברשת ליד הפה. תתחיל לצחצח 🪥")
            }
            return .passed
        }.value
    }

    /// Vision coordinates are normalized with the origin at the bottom-left, so the mouth is the
    /// lower part of the face box. The area is widened a bit, since a hand holding a brush sits
    /// beside or below the mouth.
    private static func isAtMouth(_ hand: VNHumanHandPoseObservation, face: CGRect) -> Bool {
        let mouthArea = CGRect(
            x: face.minX - face.width * 0.4,
            y: face.minY - face.height * 0.4,
            width: face.width * 1.8,
            height: face.height * 0.9
        )
        guard let points = try? hand.recognizedPoints(.all) else { return false }
        return points.values.contains { $0.confidence > 0.3 && mouthArea.contains($0.location) }
    }
}

private extension CGRect {
    var area: CGFloat { width * height }
}

private extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
