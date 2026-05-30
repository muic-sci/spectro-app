import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import 'package:spectro_app/core/constants/app_theme.dart';
import 'package:spectro_app/data/models/project.dart';

/// A reusable line chart widget for displaying spectral data.
///
/// Supports multiple overlay series and an optional vertical marker line
/// (e.g. for lambda-max).
class SpectrumChart extends StatelessWidget {
  const SpectrumChart({
    super.key,
    required this.data,
    this.xLabel = 'Pixel',
    this.yLabel = 'Intensity',
    this.title,
    this.overlayData,
    this.overlayColors,
    this.verticalMarker,
  });

  final List<DataPoint> data;
  final String xLabel;
  final String yLabel;
  final String? title;
  final List<List<DataPoint>>? overlayData;
  final List<Color>? overlayColors;
  final double? verticalMarker;

  // ── Helpers ──────────────────────────────────────────────────────────────

  List<FlSpot> _toSpots(List<DataPoint> points) {
    return points.map((p) => FlSpot(p.x, p.y)).toList();
  }

  ({double minX, double maxX, double minY, double maxY}) _computeBounds() {
    final allPoints = <DataPoint>[...data];
    if (overlayData != null) {
      for (final series in overlayData!) {
        allPoints.addAll(series);
      }
    }

    if (allPoints.isEmpty) {
      return (minX: 0, maxX: 1, minY: 0, maxY: 1);
    }

    double minX = allPoints.first.x;
    double maxX = allPoints.first.x;
    double minY = allPoints.first.y;
    double maxY = allPoints.first.y;

    for (final p in allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Add a small padding so data doesn't sit on the edge.
    final yPad = (maxY - minY) * 0.05;
    final xPad = (maxX - minX) * 0.02;
    return (
      minX: minX - xPad,
      maxX: maxX + xPad,
      minY: minY - yPad,
      maxY: maxY + yPad,
    );
  }

  static const _defaultOverlayColors = <Color>[
    Colors.orange,
    Colors.green,
    Colors.purple,
    Colors.red,
    Colors.teal,
  ];

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final bounds = _computeBounds();
    final theme = Theme.of(context);

    // Primary line data.
    final lineBars = <LineChartBarData>[
      LineChartBarData(
        spots: _toSpots(data),
        isCurved: false,
        color: theme.colorScheme.primary,
        barWidth: 2,
        dotData: const FlDotData(show: false),
        belowBarData: BarAreaData(
          show: true,
          color: theme.colorScheme.primary.withValues(alpha: 0.08),
        ),
      ),
    ];

    // Overlay series.
    if (overlayData != null) {
      for (int i = 0; i < overlayData!.length; i++) {
        final colors = overlayColors ?? _defaultOverlayColors;
        final color = colors[i % colors.length];
        lineBars.add(
          LineChartBarData(
            spots: _toSpots(overlayData![i]),
            isCurved: false,
            color: color,
            barWidth: 2,
            dotData: const FlDotData(show: false),
          ),
        );
      }
    }

    // Vertical marker.
    final extraLines = <VerticalLine>[];
    if (verticalMarker != null) {
      extraLines.add(
        VerticalLine(
          x: verticalMarker!,
          color: Colors.red.withValues(alpha: 0.7),
          strokeWidth: 1.5,
          dashArray: [6, 4],
          label: VerticalLineLabel(
            show: true,
            alignment: Alignment.topRight,
            style: AppTheme.chartValue.copyWith(color: Colors.red),
            labelResolver: (_) => verticalMarker!.toStringAsFixed(1),
          ),
        ),
      );
    }

    // Compute a nice interval for axis labels.
    double niceInterval(double range, int targetTicks) {
      if (range <= 0) return 1;
      final rawInterval = range / targetTicks;
      final magnitude = math.pow(10, (math.log(rawInterval) / math.ln10).floorToDouble());
      final normalized = rawInterval / magnitude;
      double nice;
      if (normalized <= 1.5) {
        nice = 1;
      } else if (normalized <= 3) {
        nice = 2;
      } else if (normalized <= 7) {
        nice = 5;
      } else {
        nice = 10;
      }
      return nice * magnitude;
    }

    final xInterval = niceInterval(bounds.maxX - bounds.minX, 5);
    final yInterval = niceInterval(bounds.maxY - bounds.minY, 5);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(title!, style: AppTheme.chartTitle, textAlign: TextAlign.center),
          ),
        Expanded(
          child: LineChart(
            LineChartData(
              minX: bounds.minX,
              maxX: bounds.maxX,
              minY: bounds.minY,
              maxY: bounds.maxY,
              lineBarsData: lineBars,
              extraLinesData: ExtraLinesData(verticalLines: extraLines),
              gridData: FlGridData(
                show: true,
                drawVerticalLine: true,
                horizontalInterval: yInterval,
                verticalInterval: xInterval,
                getDrawingHorizontalLine: (_) => FlLine(
                  color: Colors.grey.withValues(alpha: 0.2),
                  strokeWidth: 0.8,
                ),
                getDrawingVerticalLine: (_) => FlLine(
                  color: Colors.grey.withValues(alpha: 0.2),
                  strokeWidth: 0.8,
                ),
              ),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                bottomTitles: AxisTitles(
                  axisNameWidget: Text(xLabel, style: AppTheme.chartAxisLabel),
                  axisNameSize: 22,
                  sideTitles: SideTitles(
                    showTitles: true,
                    interval: xInterval,
                    reservedSize: 28,
                    getTitlesWidget: (value, meta) {
                      if (value == meta.min || value == meta.max) {
                        return const SizedBox.shrink();
                      }
                      return SideTitleWidget(
                        axisSide: meta.axisSide,
                        child: Text(
                          value.toStringAsFixed(0),
                          style: AppTheme.chartValue,
                        ),
                      );
                    },
                  ),
                ),
                leftTitles: AxisTitles(
                  axisNameWidget: Text(yLabel, style: AppTheme.chartAxisLabel),
                  axisNameSize: 22,
                  sideTitles: SideTitles(
                    showTitles: true,
                    interval: yInterval,
                    reservedSize: 44,
                    getTitlesWidget: (value, meta) {
                      if (value == meta.min || value == meta.max) {
                        return const SizedBox.shrink();
                      }
                      return SideTitleWidget(
                        axisSide: meta.axisSide,
                        child: Text(
                          value.toStringAsFixed(1),
                          style: AppTheme.chartValue,
                        ),
                      );
                    },
                  ),
                ),
              ),
              borderData: FlBorderData(
                show: true,
                border: Border.all(color: Colors.grey.withValues(alpha: 0.3)),
              ),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipItems: (touchedSpots) {
                    return touchedSpots.map((spot) {
                      return LineTooltipItem(
                        '(${spot.x.toStringAsFixed(1)}, ${spot.y.toStringAsFixed(3)})',
                        const TextStyle(color: Colors.white, fontSize: 11),
                      );
                    }).toList();
                  },
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
