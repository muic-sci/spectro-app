import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'package:spectro_app/core/api/sse_client.dart';
import 'package:spectro_app/core/models/capture_request.dart';

/// Result of a capture upload.
class UploadResult {
  final bool ok;
  final String? error;
  final double? saturatedPct;

  const UploadResult({required this.ok, this.error, this.saturatedPct});
}

/// Talks to Spectro Web for one paired session: resolve the token, stream
/// events, and upload captures. The join token is the only credential.
class SpectroClient {
  final String baseUrl;
  final String token;

  const SpectroClient({required this.baseUrl, required this.token});

  /// Resolve the token → experiment summary (null if expired/unknown).
  Future<SessionInfo?> resolve() async {
    try {
      final res = await http.get(Uri.parse('$baseUrl/api/join/$token'));
      if (res.statusCode != 200) return null;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return SessionInfo(
        id: json['id'] as String,
        name: json['name'] as String,
        pending: CaptureRequest.tryParse(json['pending']),
      );
    } catch (_) {
      return null;
    }
  }

  /// SSE stream of this experiment's events (capture prompts, etc.).
  SseClient events(String experimentId) {
    return SseClient(
      Uri.parse('$baseUrl/api/experiments/$experimentId/events?token=$token'),
    );
  }

  /// Upload a captured JPEG for the laptop's outstanding request.
  Future<UploadResult> upload(String experimentId, String filePath) async {
    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/api/experiments/$experimentId/captures'),
      );
      request.fields['token'] = token;
      request.files.add(
        await http.MultipartFile.fromPath(
          'file',
          filePath,
          contentType: MediaType('image', 'jpeg'),
        ),
      );

      final streamed = await request.send();
      final body = await streamed.stream.bytesToString();
      final json = body.isNotEmpty ? jsonDecode(body) as Map<String, dynamic> : <String, dynamic>{};

      if (streamed.statusCode != 200) {
        return UploadResult(ok: false, error: (json['error'] as String?) ?? 'Upload failed');
      }
      return UploadResult(
        ok: true,
        saturatedPct: (json['saturatedPct'] as num?)?.toDouble(),
      );
    } catch (e) {
      return UploadResult(ok: false, error: 'Network error: $e');
    }
  }
}
