import 'package:flutter/material.dart';

/// Application theme using Material 3 with a science / blue colour scheme.
class AppTheme {
  AppTheme._();

  // ── Seed colour ──────────────────────────────────────────────────────────
  static const Color _seed = Color(0xFF1565C0); // blue 800

  // ── Colour scheme ────────────────────────────────────────────────────────
  static final ColorScheme _lightScheme = ColorScheme.fromSeed(
    seedColor: _seed,
    brightness: Brightness.light,
  );

  // ── Text styles for chart labels ─────────────────────────────────────────
  static const TextStyle chartAxisLabel = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: Colors.black87,
  );

  static const TextStyle chartTitle = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: Colors.black87,
  );

  static const TextStyle chartValue = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w400,
    color: Colors.black54,
  );

  // ── Light theme ──────────────────────────────────────────────────────────
  static final ThemeData light = ThemeData(
    useMaterial3: true,
    colorScheme: _lightScheme,
    appBarTheme: AppBarTheme(
      centerTitle: true,
      backgroundColor: _lightScheme.surface,
      foregroundColor: _lightScheme.onSurface,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      filled: true,
    ),
  );
}
