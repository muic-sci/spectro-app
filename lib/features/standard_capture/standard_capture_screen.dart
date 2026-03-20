import 'package:flutter/material.dart';

import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/shared/widgets/info_card.dart';

/// Screen for capturing standard solutions of known concentration.
///
/// The caller provides the current list of [standards] and callbacks for
/// camera capture and list mutation.
class StandardCaptureScreen extends StatefulWidget {
  const StandardCaptureScreen({
    super.key,
    required this.standards,
    required this.onCapture,
    required this.onRemove,
  });

  /// Currently captured standards.
  final List<StandardMeasurement> standards;

  /// Called when the user wants to add a standard. The callback receives the
  /// concentration and unit, opens the camera, and returns a
  /// [StandardMeasurement] (or null on cancel).
  final Future<StandardMeasurement?> Function(
      double concentration, String unit) onCapture;

  /// Called when the user removes a standard at [index].
  final void Function(int index) onRemove;

  @override
  State<StandardCaptureScreen> createState() => _StandardCaptureScreenState();
}

class _StandardCaptureScreenState extends State<StandardCaptureScreen> {
  static const int _minStandards = 2;

  Future<void> _addStandard() async {
    final result = await _showConcentrationDialog();
    if (result == null) return;
    await widget.onCapture(result.$1, result.$2);
  }

  Future<(double, String)?> _showConcentrationDialog() async {
    final concentrationController = TextEditingController();
    final unitController = TextEditingController(text: 'mg/L');

    return showDialog<(double, String)>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Standard Concentration'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: concentrationController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Concentration',
                border: OutlineInputBorder(),
              ),
              autofocus: true,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: unitController,
              decoration: const InputDecoration(
                labelText: 'Unit',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final value = double.tryParse(concentrationController.text);
              if (value == null || value < 0) return;
              Navigator.pop(ctx, (value, unitController.text));
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = widget.standards.length;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'Standard Solutions',
            content:
                'Capture images of standard solutions with known '
                'concentrations. These are used to build a Beer-Lambert '
                'calibration curve (Absorbance vs Concentration). '
                'You need at least 2 standards, but more points give a '
                'better calibration.',
            icon: Icons.format_list_numbered,
          ),
          const SizedBox(height: 12),

          // Count indicator.
          Text(
            '$count of minimum $_minStandards standards captured',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: count >= _minStandards ? Colors.green : Colors.orange,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),

          // List of standards.
          Expanded(
            child: count == 0
                ? Center(
                    child: Text(
                      'No standards captured yet.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  )
                : ListView.builder(
                    itemCount: count,
                    itemBuilder: (context, index) {
                      final std = widget.standards[index];
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            child: Text('${index + 1}'),
                          ),
                          title: Text(
                            '${std.concentration} ${std.unit}',
                          ),
                          subtitle: Text(
                            'Captured ${_formatTime(std.image.capturedAt)}',
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () => widget.onRemove(index),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          const SizedBox(height: 12),

          FilledButton.icon(
            onPressed: _addStandard,
            icon: const Icon(Icons.add_a_photo),
            label: const Text('Add Standard'),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:'
        '${dt.minute.toString().padLeft(2, '0')}:'
        '${dt.second.toString().padLeft(2, '0')}';
  }
}
