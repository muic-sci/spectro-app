/// What the laptop is asking the phone to shoot (mirrors the web
/// `CaptureRequest` stored in Experiment.pendingCapture).
class CaptureRequest {
  final String role;
  final String label;
  final num? concentration;
  final String? unit;

  const CaptureRequest({
    required this.role,
    required this.label,
    this.concentration,
    this.unit,
  });

  /// Parse from the loosely-typed JSON delivered over SSE / the resolve API.
  static CaptureRequest? tryParse(dynamic json) {
    if (json is Map && json['role'] is String && json['label'] is String) {
      return CaptureRequest(
        role: json['role'] as String,
        label: json['label'] as String,
        concentration: json['concentration'] is num ? json['concentration'] as num : null,
        unit: json['unit'] is String ? json['unit'] as String : null,
      );
    }
    return null;
  }
}

/// The experiment a join token resolves to.
class SessionInfo {
  final String id;
  final String name;
  final CaptureRequest? pending;

  const SessionInfo({required this.id, required this.name, this.pending});
}
