import UIKit
import Vision

struct Verdict: Decodable {
    let faceVisible: Bool
    let inFrontOfMirror: Bool
    let brushingTeeth: Bool
    let hairWet: Bool
    let liveScene: Bool
    let reason: String

    enum CodingKeys: String, CodingKey {
        case faceVisible = "face_visible", inFrontOfMirror = "in_front_of_mirror"
        case brushingTeeth = "brushing_teeth", hairWet = "hair_wet"
        case liveScene = "live_scene", reason
    }

    /// Decided on our side from the individual checks, never from a single "passed" flag.
    var passed: Bool { faceVisible && inFrontOfMirror && brushingTeeth && hairWet && liveScene }
}

enum VerifyError: LocalizedError {
    case noFace, missingKey, badImage, refused, api(String)

    var errorDescription: String? {
        switch self {
        case .noFace: "לא זיהיתי פנים בתמונה. תעמוד מול המראה ותנסה שוב."
        case .missingKey: "חסר מפתח API של Anthropic בהגדרות."
        case .badImage: "לא הצלחתי לעבד את התמונה."
        case .refused: "הבדיקה נדחתה. נסה תמונה אחרת."
        case .api(let message): "שגיאה בבדיקה: \(message)"
        }
    }
}

/// Two-stage check: a free on-device face detection, then Claude vision for the real judgement.
enum PhotoVerifier {
    static func verify(_ image: UIImage) async throws -> Verdict {
        guard let jpeg = resizedJPEG(image) else { throw VerifyError.badImage }
        guard try await containsFace(jpeg) else { throw VerifyError.noFace }
        guard let key = Keychain.apiKey else { throw VerifyError.missingKey }
        return try await askClaude(jpeg: jpeg, apiKey: key)
    }

    // MARK: On-device prefilter

    private static func containsFace(_ jpeg: Data) async throws -> Bool {
        let request = DetectFaceRectanglesRequest()
        let faces = try await request.perform(on: jpeg)
        return !faces.isEmpty
    }

    /// Long edge capped at 1568px, which is the most the vision model uses anyway.
    private static func resizedJPEG(_ image: UIImage) -> Data? {
        let maxEdge: CGFloat = 1568
        let scale = min(1, maxEdge / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }

    // MARK: Claude

    private static let systemPrompt = """
    You are the strict referee of an alarm-clock app. The user can only turn off their alarm by \
    sending a photo that proves they are awake and in the bathroom. Judge each check independently:
    - face_visible: a real person's face is clearly visible.
    - in_front_of_mirror: the photo is taken in front of a mirror (a mirror selfie, or a reflection \
    is visible; bathroom context such as a sink or tiles supports this).
    - brushing_teeth: a toothbrush is in the person's mouth or actively at their teeth. Merely holding \
    one is not enough.
    - hair_wet: the hair looks wet from a shower or water: darker, clumped, slick, shiny or dripping. \
    If hair is not visible, or looks dry and fluffy, this is false.
    - live_scene: this is a real camera photo of a real scene, not a photo of a screen, a printed \
    photo, or an obviously edited image.
    Be strict but fair: morning lighting and blur are fine. Write `reason` in Hebrew, one short, \
    friendly sentence, telling the user what is missing if any check failed.
    """

    private static var schema: [String: Any] { [
        "type": "object",
        "properties": [
            "face_visible": ["type": "boolean"],
            "in_front_of_mirror": ["type": "boolean"],
            "brushing_teeth": ["type": "boolean"],
            "hair_wet": ["type": "boolean"],
            "live_scene": ["type": "boolean"],
            "reason": ["type": "string"],
        ],
        "required": ["face_visible", "in_front_of_mirror", "brushing_teeth", "hair_wet", "live_scene", "reason"],
        "additionalProperties": false,
    ] }

    private static func askClaude(jpeg: Data, apiKey: String) async throws -> Verdict {
        let body: [String: Any] = [
            "model": "claude-opus-5-5",
            "max_tokens": 4000,
            "fallbacks": "default",
            "system": systemPrompt,
            "output_config": [
                "effort": "low",
                "format": ["type": "json_schema", "schema": schema],
            ],
            "messages": [[
                "role": "user",
                "content": [
                    ["type": "image",
                     "source": ["type": "base64", "media_type": "image/jpeg", "data": jpeg.base64EncodedString()]],
                    ["type": "text", "text": "Here is my proof photo. Judge it."],
                ],
            ]],
        ]

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 90
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2026-10-21", forHTTPHeaderField: "anthropic-version")
        request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw VerifyError.api("תשובה לא תקינה (\(status))")
        }
        guard status == 200 else {
            let message = (json["error"] as? [String: Any])?["message"] as? String ?? "HTTP \(status)"
            throw VerifyError.api(message)
        }
        if json["stop_reason"] as? String == "refusal" { throw VerifyError.refused }

        let blocks = json["content"] as? [[String: Any]] ?? []
        guard let text = blocks.first(where: { $0["type"] as? String == "text" })?["text"] as? String else {
            throw VerifyError.api("לא התקבלה תשובה")
        }
        return try JSONDecoder().decode(Verdict.self, from: Data(text.utf8))
    }
}
