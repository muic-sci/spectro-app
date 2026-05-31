import 'package:flutter/material.dart';

import 'package:spectro_app/core/constants/app_theme.dart';
import 'package:spectro_app/features/join/join_screen.dart';

/// Spectro Capture — the phone as a focus-locked camera for Spectro Web.
/// All guidance and analysis live on the laptop; this app scans the pairing QR,
/// joins the session, and uploads photos on request.
class SpectroApp extends StatelessWidget {
  const SpectroApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Spectro Capture',
      theme: AppTheme.dark,
      debugShowCheckedModeBanner: false,
      home: const JoinScreen(),
    );
  }
}
