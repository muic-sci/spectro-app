import 'package:flutter/material.dart';

import 'package:spectro_app/core/api/spectro_client.dart';
import 'package:spectro_app/core/utils/join_link.dart';
import 'package:spectro_app/features/join/qr_scan_screen.dart';
import 'package:spectro_app/features/session/session_screen.dart';

/// P0 — home / join. The phone's entry point: scan the laptop's QR to join a
/// session. Everything else (guidance, analysis) lives on the laptop.
class JoinScreen extends StatefulWidget {
  const JoinScreen({super.key});

  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _scanAndJoin() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    final scanned = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const QrScanScreen()),
    );

    if (!mounted) return;
    if (scanned == null) {
      setState(() => _busy = false);
      return;
    }

    final target = parseJoinLink(scanned);
    if (target == null) {
      setState(() {
        _busy = false;
        _error = "That QR code isn't a Spectro session. Scan the code on your computer.";
      });
      return;
    }

    final client = SpectroClient(baseUrl: target.baseUrl, token: target.token);
    final session = await client.resolve();
    if (!mounted) return;

    if (session == null) {
      setState(() {
        _busy = false;
        _error = "That code has expired. Generate a fresh one on your computer and scan again.";
      });
      return;
    }

    setState(() => _busy = false);
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SessionScreen(client: client, session: session),
      ),
    );
    if (mounted) setState(() => _error = null);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(Icons.qr_code_scanner, size: 56, color: cs.primary),
              const SizedBox(height: 20),
              Text(
                'Spectro Capture',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: cs.onSurface,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Your phone is the camera. Scan the code on your computer to begin.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, color: cs.onSurfaceVariant, height: 1.4),
              ),
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: _busy ? null : _scanAndJoin,
                icon: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.qr_code_scanner),
                label: Text(_busy ? 'Connecting…' : 'Scan to join a session'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 20),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: cs.error, fontSize: 13.5),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
