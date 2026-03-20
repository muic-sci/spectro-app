import 'package:flutter/material.dart';

/// A small chip that shows whether the camera focus is locked.
class FocusLockIndicator extends StatelessWidget {
  /// Whether focus (and exposure) are currently locked.
  final bool isLocked;

  const FocusLockIndicator({super.key, required this.isLocked});

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: isLocked ? Colors.green : Colors.orange,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isLocked ? Icons.lock : Icons.touch_app,
            color: Colors.white,
            size: 16,
          ),
          const SizedBox(width: 4),
          Text(
            isLocked ? 'Focus Locked' : 'Tap to Focus',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
