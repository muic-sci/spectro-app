import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import 'package:spectro_app/core/constants/app_theme.dart';
import 'package:spectro_app/data/models/project.dart';

/// A scatter plot with a regression line overlay.
///
/// Displays data points, a best-fit line defined by [slope] / [intercept],
/// and annotates the chart with the equation and R-squared value.
class ScatterPlotChart extends StatelessWidget {
  const ScatterPlotChart({
    super.key,
    required this.data,
    required this.slope,
    required this.intercept,
    required this.rSquared,
    this.xLabel = 'x',
    this.yLabel = 'y',
    this.title,
    this.highlightPoint,
  });

  final List<DataPoint> data;
  final double slope;
  final double intercept;
  final double rSquared;
  final String xLabel;
  final String yLabel;
  final String? title;
  final DataPoint? highlightPoint;

  // ── Helpers ──────────────────────────────────────────────────────────────

  ({double minX, double maxX, double minY, double maxY}) _computeBounds() {
    final allPoints = <DataPoint>[...data];
    if (highlightPoint != null) allPoints.add(highlightPoint!);

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

    // Include regression line endpoints in bounds.
    final lineYAtMinX = slope * minX + intercept;
    final lineYAtMaxX = slope * maxX + intercept;
    minY = math.min(minY, math.min(lineYAtMinX, lineYAtMaxX));
    maxY = math.max(maxY, math.max(lineYAtMinX, lineYAtMaxX));

    // Start axes at zero when data is positive.
    if (minX > 0) minX = 0;
    if (minY > 0) minY = 0;

    final xPad = (maxX - minX) * 0.08;
    final yPad = (maxY - minY) * 0.08;
    return (
      minX: minX - xPad,
      maxX: maxX + xPad,
      minY: minY - yPad,
      maxY: maxY + yPad,
    );
  }

  double _niceInterval(double range, int targetTicks) {
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

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final bounds = _computeBounds();
    final theme = Theme.of(context);

    final xInterval = _niceInterval(bounds.maxX - bounds.minX, 5);
    final yInterval = _niceInterval(bounds.maxY - bounds.minY, 5);

    // Scatter points as a line-chart series with only dots visible.
    final scatterSeries = LineChartBarData(
      spots: data.map((p) => FlSpot(p.x, p.y)).toList(),
      isCurved: false,
      color: Colors.transparent,
      barWidth: 0,
      dotData: FlDotData(
        show: true,
        getDotPainter: (spot, percent, bar, index) {
          return FlDotCirclePainter(
            radius: 5,
            color: theme.colorScheme.primary,
            strokeWidth: 1.5,
            strokeColor: Colors.white,
          );
        },
      ),
    );

    // Regression line.
    final lineX0 = bounds.minX;
    final lineX1 = bounds.maxX;
    final lineY0 = slope * lineX0 + intercept;
    final lineY1 = slope * lineX1 + intercept;

    final regressionSeries = LineChartBarData(
      spots: [FlSpot(lineX0, lineY0), FlSpot(lineX1, lineY1)],
      isCurved: false,
      color: theme.colorScheme.error,
      barWidth: 2,
      dashArray: [6, 4],
      dotData: const FlDotData(show: false),
    );

    // All line bars.
    final lineBars = <LineChartBarData>[scatterSeries, regressionSeries];

    // Highlight point.
    if (highlightPoint != null) {
      lineBars.add(
        LineChartBarData(
          spots: [FlSpot(highlightPoint!.x, highlightPoint!.y)],
          isCurved: false,
          color: Colors.transparent,
          barWidth: 0,
          dotData: FlDotData(
            show: true,
            getDotPainter: (spot, percent, bar, index) {
              return FlDotCirclePainter(
                radius: 7,
                color: Colors.orange,
                strokeWidth: 2,
                strokeColor: Colors.white,
              );
            },
          ),
        ),
      );
    }

    // Equation string.
    final sign = intercept >= 0 ? '+' : '-';
    final equation =
        'y = ${slope.toStringAsFixed(4)}x $sign ${intercept.abs().toStringAsFixed(4)}';
    final rSqText = 'R\u00B2 = ${rSquared.toStringAsFixed(4)}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(title!, style: AppTheme.chartTitle, textAlign: TextAlign.center),
          ),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            '$equation    $rSqText',
            style: AppTheme.chartValue.copyWith(fontStyle: FontStyle.italic),
            textAlign: TextAlign.center,
          ),
        ),
        Expanded(
          child: LineChart(
            LineChartData(
              minX: bounds.minX,
              maxX: bounds.maxX,
              minY: bounds.minY,
              maxY: bounds.maxY,
              lineBarsData: lineBars,
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
                          value.toStringAsFixed(1),
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
                          value.toStringAsFixed(3),
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
                        '(${spot.x.toStringAsFixed(2)}, ${spot.y.toStringAsFixed(4)})',
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
