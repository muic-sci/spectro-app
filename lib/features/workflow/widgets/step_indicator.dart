import 'package:flutter/material.dart';

import 'package:spectro_app/data/models/project.dart';

/// A horizontal step indicator that shows all [WorkflowStep] values as small
/// circles connected by lines.
class StepIndicator extends StatelessWidget {
  const StepIndicator({super.key, required this.currentStep});

  final WorkflowStep currentStep;

  static const List<String> _shortLabels = [
    'Camera',
    'Calibrate',
    'ROI',
    'Blank',
    'Standards',
    'Analyse',
    'Unknown',
    'Results',
  ];

  @override
  Widget build(BuildContext context) {
    assert(_shortLabels.length == WorkflowStep.values.length);

    final theme = Theme.of(context);
    final currentIndex = currentStep.index;

    return SizedBox(
      height: 72,
      child: Row(
        children: List.generate(WorkflowStep.values.length * 2 - 1, (raw) {
          // Odd indices are connecting lines; even indices are step circles.
          if (raw.isOdd) {
            final stepBefore = raw ~/ 2;
            final completed = stepBefore < currentIndex;
            return Expanded(
              child: Container(
                height: 2,
                color: completed
                    ? theme.colorScheme.primary
                    : theme.colorScheme.outlineVariant,
              ),
            );
          }

          final stepIndex = raw ~/ 2;
          final isCompleted = stepIndex < currentIndex;
          final isCurrent = stepIndex == currentIndex;

          return _StepCircle(
            label: _shortLabels[stepIndex],
            isCompleted: isCompleted,
            isCurrent: isCurrent,
          );
        }),
      ),
    );
  }
}

class _StepCircle extends StatelessWidget {
  const _StepCircle({
    required this.label,
    required this.isCompleted,
    required this.isCurrent,
  });

  final String label;
  final bool isCompleted;
  final bool isCurrent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    Color bgColor;
    Widget child;

    if (isCompleted) {
      bgColor = theme.colorScheme.primary;
      child = Icon(Icons.check, size: 14, color: theme.colorScheme.onPrimary);
    } else if (isCurrent) {
      bgColor = theme.colorScheme.primary;
      child = const SizedBox.shrink();
    } else {
      bgColor = Colors.transparent;
      child = const SizedBox.shrink();
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: bgColor,
            border: Border.all(
              color: isCompleted || isCurrent
                  ? theme.colorScheme.primary
                  : theme.colorScheme.outlineVariant,
              width: 2,
            ),
          ),
          child: Center(child: child),
        ),
        const SizedBox(height: 4),
        SizedBox(
          width: 48,
          child: Text(
            label,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 9,
              color: isCurrent
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurfaceVariant,
              fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
            ),
          ),
        ),
      ],
    );
  }
}
