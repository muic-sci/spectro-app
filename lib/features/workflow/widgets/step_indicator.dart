import 'package:flutter/material.dart';

import 'package:spectro_app/data/models/project.dart';

/// Horizontal step indicator showing progress through the 5-step workflow.
///
/// Each step is represented by a numbered circle; completed steps show a
/// check mark, the current step pulses with the primary colour, and future
/// steps are dimmed. Steps are connected by lines that fill with the primary
/// colour as work progresses.
class StepIndicator extends StatelessWidget {
  const StepIndicator({super.key, required this.currentStep});

  final WorkflowStep currentStep;

  static const List<String> _labels = [
    'Setup',
    'Calibrate',
    'References',
    'Unknown',
    'Results',
  ];

  @override
  Widget build(BuildContext context) {
    assert(_labels.length == WorkflowStep.values.length);

    final cs = Theme.of(context).colorScheme;
    final currentIndex = currentStep.index;
    final total = WorkflowStep.values.length;

    return SizedBox(
      height: 68,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: List.generate(total * 2 - 1, (i) {
          if (i.isOdd) {
            final stepBefore = i ~/ 2;
            final completed = stepBefore < currentIndex;
            return Expanded(
              child: Padding(
                // Align line to the vertical centre of the circles (16px radius = 16pt from top).
                padding: const EdgeInsets.only(top: 16),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  height: 2,
                  decoration: BoxDecoration(
                    gradient: completed
                        ? const LinearGradient(
                            colors: [Color(0xFF00BCD4), Color(0xFF26C6DA)],
                          )
                        : null,
                    color: completed
                        ? null
                        : Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(1),
                  ),
                ),
              ),
            );
          }

          final stepIndex = i ~/ 2;
          final isCompleted = stepIndex < currentIndex;
          final isCurrent = stepIndex == currentIndex;

          return _StepNode(
            number: stepIndex + 1,
            label: _labels[stepIndex],
            isCompleted: isCompleted,
            isCurrent: isCurrent,
            cs: cs,
          );
        }),
      ),
    );
  }
}

class _StepNode extends StatelessWidget {
  const _StepNode({
    required this.number,
    required this.label,
    required this.isCompleted,
    required this.isCurrent,
    required this.cs,
  });

  final int number;
  final String label;
  final bool isCompleted;
  final bool isCurrent;
  final ColorScheme cs;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Circle
        Stack(
          alignment: Alignment.center,
          children: [
            // Outer glow ring for current step
            if (isCurrent)
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: cs.primary.withValues(alpha: 0.18),
                ),
              ),
            // Main circle
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: isCompleted || isCurrent
                    ? const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF00BCD4), Color(0xFF0097A7)],
                      )
                    : null,
                color: isCompleted || isCurrent
                    ? null
                    : Colors.white.withValues(alpha: 0.07),
                border: Border.all(
                  color: isCompleted || isCurrent
                      ? Colors.transparent
                      : Colors.white.withValues(alpha: 0.2),
                  width: 1.5,
                ),
              ),
              child: Center(
                child: isCompleted
                    ? const Icon(Icons.check_rounded,
                        size: 15, color: Colors.white)
                    : Text(
                        '$number',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: isCurrent
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.35),
                        ),
                      ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        // Label
        SizedBox(
          width: 52,
          child: Text(
            label,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 9,
              fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w400,
              color: isCurrent
                  ? cs.primary
                  : isCompleted
                      ? Colors.white.withValues(alpha: 0.5)
                      : Colors.white.withValues(alpha: 0.25),
              letterSpacing: 0.2,
            ),
          ),
        ),
      ],
    );
  }
}
