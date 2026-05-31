import 'dart:async';

import 'package:flutter/material.dart';

import 'package:spectro_app/core/api/spectro_client.dart';
import 'package:spectro_app/core/api/sse_client.dart';
import 'package:spectro_app/core/models/capture_request.dart';
import 'package:spectro_app/features/camera/capture_screen.dart';

/// P2/P3/P6 — the resting + capture screen. Listens for the laptop's capture
/// prompts over SSE, opens the camera on demand, and uploads. The phone is
/// purely reactive: it shows exactly what the laptop asked for.
class SessionScreen extends StatefulWidget {
  final SpectroClient client;
  final SessionInfo session;

  const SessionScreen({super.key, required this.client, required this.session});

  @override
  State<SessionScreen> createState() => _SessionScreenState();
}

class _SessionScreenState extends State<SessionScreen> {
  late final SseClient _sse;
  StreamSubscription<Map<String, dynamic>>? _sub;

  CaptureRequest? _pending;
  bool _uploading = false;
  String? _statusMessage;
  double? _lastSaturatedPct;

  @override
  void initState() {
    super.initState();
    _pending = widget.session.pending;
    _sse = widget.client.events(widget.session.id);
    _sub = _sse.stream.listen(_onEvent);
    _sse.start();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _sse.close();
    super.dispose();
  }

  void _onEvent(Map<String, dynamic> event) {
    switch (event['type']) {
      case 'pending':
        setState(() {
          _pending = CaptureRequest.tryParse(event['data']);
          _statusMessage = null;
        });
        break;
      case 'captured':
        setState(() => _pending = null);
        break;
    }
  }

  Future<void> _capture() async {
    final pending = _pending;
    if (pending == null) return;

    final path = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => CaptureScreen(label: pending.label)),
    );
    if (!mounted || path == null) return;

    setState(() {
      _uploading = true;
      _statusMessage = null;
    });
    final result = await widget.client.upload(widget.session.id, path);
    if (!mounted) return;

    setState(() {
      _uploading = false;
      if (result.ok) {
        _statusMessage = 'Sent — look at your laptop.';
        _lastSaturatedPct = result.saturatedPct;
        _pending = null;
      } else {
        _statusMessage = result.error ?? 'Upload failed';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.session.name),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: _LinkedBadge(),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Center(child: _buildBody(context)),
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (_uploading) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text('Sending photo…', style: TextStyle(color: cs.onSurfaceVariant)),
        ],
      );
    }

    final pending = _pending;
    if (pending != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Laptop is asking for',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, letterSpacing: 1, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          Text(
            pending.label,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: cs.primary),
          ),
          const SizedBox(height: 28),
          FilledButton.icon(
            onPressed: _capture,
            icon: const Icon(Icons.camera_alt),
            label: const Text('Open camera'),
          ),
        ],
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.check_circle_outline, size: 48, color: cs.primary),
        const SizedBox(height: 14),
        Text(
          'Connected',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: cs.onSurface),
        ),
        const SizedBox(height: 8),
        Text(
          'Watch your laptop for the next step. When it asks for a photo, it shows up here.',
          textAlign: TextAlign.center,
          style: TextStyle(color: cs.onSurfaceVariant, height: 1.4),
        ),
        if (_statusMessage != null) ...[
          const SizedBox(height: 20),
          Text(
            _statusMessage!,
            textAlign: TextAlign.center,
            style: TextStyle(color: cs.onSurface, fontWeight: FontWeight.w600),
          ),
          if (_lastSaturatedPct != null && _lastSaturatedPct! >= 1) ...[
            const SizedBox(height: 6),
            Text(
              '${_lastSaturatedPct!.toStringAsFixed(0)}% of pixels looked over-exposed — your teacher may ask you to redo it.',
              textAlign: TextAlign.center,
              style: TextStyle(color: cs.tertiary, fontSize: 12.5),
            ),
          ],
        ],
      ],
    );
  }
}

class _LinkedBadge extends StatelessWidget {
  const _LinkedBadge();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(color: cs.primary, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text('Linked', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 13)),
      ],
    );
  }
}
