import 'package:flutter/material.dart';

/// Application theme — dark-first, science-lab aesthetic.
class AppTheme {
  AppTheme._();

  // Teal-cyan seed generates a harmonious palette that evokes the
  // visible-light spectrum and scientific instruments.
  static const Color _seed = Color(0xFF00BCD4);

  // ── Spectrum gradient ────────────────────────────────────────────────────
  // Decorative accent used throughout the UI to reinforce the
  // spectrophotometry theme.
  static const LinearGradient spectrumGradient = LinearGradient(
    colors: [
      Color(0xFF7B2FBE), // violet
      Color(0xFF3F51B5), // indigo
      Color(0xFF00BCD4), // cyan
      Color(0xFF4CAF50), // green
      Color(0xFFFFEB3B), // yellow
      Color(0xFFFF9800), // orange
      Color(0xFFF44336), // red
    ],
  );

  // ── Chart text styles (light-on-dark) ────────────────────────────────────
  static const TextStyle chartAxisLabel = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    color: Color(0xFFB0BEC5),
  );

  static const TextStyle chartTitle = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: Color(0xFFCFD8DC),
  );

  static const TextStyle chartValue = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w400,
    color: Color(0xFF90A4AE),
  );

  // ── Dark theme ───────────────────────────────────────────────────────────
  static ThemeData get dark {
    final cs = ColorScheme.fromSeed(
      seedColor: _seed,
      brightness: Brightness.dark,
    ).copyWith(
      surface:                 const Color(0xFF0F1B2D),
      surfaceContainerLowest:  const Color(0xFF080E1C),
      surfaceContainerLow:     const Color(0xFF111C2E),
      surfaceContainer:        const Color(0xFF162135),
      surfaceContainerHigh:    const Color(0xFF1B283D),
      surfaceContainerHighest: const Color(0xFF203047),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: cs,
      scaffoldBackgroundColor: const Color(0xFF080E1C),

      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: cs.onSurface,
          fontSize: 20,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.3,
        ),
        iconTheme: IconThemeData(color: cs.onSurface),
      ),

      cardTheme: CardThemeData(
        elevation: 0,
        color: const Color(0xFF111C2E),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.07)),
        ),
        margin: EdgeInsets.zero,
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF162135),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: cs.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        labelStyle: TextStyle(color: cs.onSurfaceVariant),
      ),

      dividerTheme: DividerThemeData(
        color: Colors.white.withValues(alpha: 0.07),
        thickness: 1,
        space: 0,
      ),

      tabBarTheme: TabBarThemeData(
        labelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        unselectedLabelStyle:
            const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
        indicator: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: cs.primaryContainer.withValues(alpha: 0.5),
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
        labelColor: cs.primary,
        unselectedLabelColor: cs.onSurfaceVariant,
        labelPadding: const EdgeInsets.symmetric(horizontal: 4),
      ),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1B283D),
        contentTextStyle: TextStyle(color: cs.onSurface),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: const Color(0xFF111C2E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        titleTextStyle: TextStyle(
          color: cs.onSurface,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),

      listTileTheme: const ListTileThemeData(tileColor: Colors.transparent),
    );
  }

  // ── Light theme (fallback) ───────────────────────────────────────────────
  static ThemeData get light {
    final cs = ColorScheme.fromSeed(seedColor: _seed);
    return ThemeData(
      useMaterial3: true,
      colorScheme: cs,
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: cs.outlineVariant),
        ),
        margin: EdgeInsets.zero,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}
