import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Minimal Server-Sent Events client over dart:io with automatic reconnect.
/// Emits each `data:` frame's parsed JSON object. Used to receive the laptop's
/// capture prompts and connection events.
class SseClient {
  final Uri uri;
  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  bool _closed = false;
  HttpClient? _http;

  SseClient(this.uri);

  Stream<Map<String, dynamic>> get stream => _controller.stream;

  /// Begin connecting (and reconnecting until [close]).
  void start() {
    _run();
  }

  Future<void> _run() async {
    while (!_closed) {
      try {
        _http = HttpClient();
        final request = await _http!.getUrl(uri);
        request.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
        final response = await request.close();

        if (response.statusCode != 200) {
          await response.drain<void>();
          throw HttpException('SSE status ${response.statusCode}');
        }

        var buffer = '';
        await for (final chunk in response.transform(utf8.decoder)) {
          if (_closed) break;
          buffer += chunk;
          int sep;
          while ((sep = buffer.indexOf('\n\n')) >= 0) {
            final frame = buffer.substring(0, sep);
            buffer = buffer.substring(sep + 2);
            for (final line in const LineSplitter().convert(frame)) {
              if (!line.startsWith('data:')) continue;
              final data = line.substring(5).trim();
              try {
                final decoded = jsonDecode(data);
                if (decoded is Map<String, dynamic>) _controller.add(decoded);
              } catch (_) {
                // ignore malformed frame
              }
            }
          }
        }
      } catch (_) {
        // fall through to reconnect
      }
      _http?.close(force: true);
      if (!_closed) {
        await Future<void>.delayed(const Duration(seconds: 2));
      }
    }
  }

  void close() {
    _closed = true;
    _http?.close(force: true);
    if (!_controller.isClosed) _controller.close();
  }
}
