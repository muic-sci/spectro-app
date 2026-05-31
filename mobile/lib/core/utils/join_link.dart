/// The scan target derived from the laptop's pairing QR: the server base URL
/// (so the phone knows where to talk) and the join token (its only credential).
class JoinTarget {
  /// e.g. `http://192.168.1.8:3000`
  final String baseUrl;
  final String token;

  const JoinTarget({required this.baseUrl, required this.token});
}

/// Parse a scanned QR payload. The laptop encodes an absolute URL of the form
/// `http(s)://<host>/join/<token>`; we extract the origin + token from it.
/// Returns null if the payload isn't a recognisable join URL.
JoinTarget? parseJoinLink(String raw) {
  final trimmed = raw.trim();
  final uri = Uri.tryParse(trimmed);
  if (uri == null) return null;
  if (uri.scheme != 'http' && uri.scheme != 'https') return null;
  if (uri.host.isEmpty) return null;

  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  final joinIndex = segments.indexOf('join');
  if (joinIndex < 0 || joinIndex + 1 >= segments.length) return null;

  final token = segments[joinIndex + 1];
  if (token.isEmpty) return null;

  return JoinTarget(baseUrl: '${uri.scheme}://${uri.authority}', token: token);
}
