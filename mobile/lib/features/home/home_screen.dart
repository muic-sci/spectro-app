import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:spectro_app/core/constants/app_theme.dart';
import 'package:spectro_app/core/constants/app_version.dart';
import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/data/repositories/project_repository.dart';

// ── State ────────────────────────────────────────────────────────────────────

class ProjectListNotifier extends StateNotifier<List<Project>> {
  ProjectListNotifier(this._repo) : super([]) {
    refresh();
  }

  final ProjectRepository _repo;

  void createProject(String name) {
    _repo.save(Project(name: name));
    refresh();
  }

  void deleteProject(String id) {
    _repo.delete(id);
    refresh();
  }

  void refresh() => state = _repo.getAll();
}

final projectListProvider =
    StateNotifierProvider<ProjectListNotifier, List<Project>>((ref) {
  return ProjectListNotifier(ref.watch(projectRepositoryProvider));
});

// ── Home screen ──────────────────────────────────────────────────────────────

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectListProvider);

    return Scaffold(
      body: Column(
        children: [
          _Header(projectCount: projects.length),
          Expanded(
            child: projects.isEmpty
                ? const _EmptyState()
                : _ProjectList(projects: projects, ref: ref),
          ),
        ],
      ),
      floatingActionButton: _NewExperimentFab(ref: ref),
    );
  }
}

// ── Header ───────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({required this.projectCount});
  final int projectCount;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF0D2137),
            cs.primaryContainer.withValues(alpha: 0.4),
          ],
        ),
        border: Border(
          bottom: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // App icon + name row
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [cs.primary, cs.tertiary],
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.biotech,
                        color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 14),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Spectro App',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.5,
                        ),
                      ),
                      Text(
                        appVersion,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.5),
                          fontSize: 12,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Spectrum decorative strip
              ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: Container(
                  height: 3,
                  decoration:
                      const BoxDecoration(gradient: AppTheme.spectrumGradient),
                ),
              ),
              const SizedBox(height: 16),

              // Stats row
              Row(
                children: [
                  _StatChip(
                    icon: Icons.folder_outlined,
                    label: '$projectCount ${projectCount == 1 ? 'experiment' : 'experiments'}',
                  ),
                  const SizedBox(width: 10),
                  _StatChip(
                    icon: Icons.science_outlined,
                    label: 'Beer-Lambert',
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: cs.primary),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.7),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Project list ─────────────────────────────────────────────────────────────

class _ProjectList extends StatelessWidget {
  const _ProjectList({required this.projects, required this.ref});
  final List<Project> projects;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      itemCount: projects.length,
      itemBuilder: (context, index) {
        final project = projects[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ProjectCard(
            project: project,
            onTap: () =>
                Navigator.pushNamed(context, '/workflow', arguments: project.id),
            onDelete: () => ref
                .read(projectListProvider.notifier)
                .deleteProject(project.id),
          ),
        );
      },
    );
  }
}

// ── Project card ─────────────────────────────────────────────────────────────

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({
    required this.project,
    required this.onTap,
    required this.onDelete,
  });

  final Project project;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  static const _stepProgress = {
    WorkflowStep.setup: 0,
    WorkflowStep.calibration: 1,
    WorkflowStep.references: 2,
    WorkflowStep.unknown: 3,
    WorkflowStep.results: 4,
  };

  static const _stepLabels = {
    WorkflowStep.setup: 'Setup',
    WorkflowStep.calibration: 'Calibration',
    WorkflowStep.references: 'References',
    WorkflowStep.unknown: 'Unknown Capture',
    WorkflowStep.results: 'Results',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final progress =
        (_stepProgress[project.currentStep]! + 1) / WorkflowStep.values.length;
    final dateStr =
        '${project.updatedAt.day}/${project.updatedAt.month}/${project.updatedAt.year}';

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Spectrum strip at top
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(16)),
              child: Container(
                height: 3,
                decoration: const BoxDecoration(
                    gradient: AppTheme.spectrumGradient),
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      // Icon badge
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: cs.primaryContainer.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(Icons.science,
                            color: cs.primary, size: 20),
                      ),
                      const SizedBox(width: 12),

                      // Name + date
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              project.name,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                                letterSpacing: -0.2,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Updated $dateStr',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: cs.onSurface.withValues(alpha: 0.4),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Delete
                      IconButton(
                        icon: Icon(Icons.delete_outline,
                            size: 18, color: cs.onSurface.withValues(alpha: 0.35)),
                        onPressed: onDelete,
                        tooltip: 'Delete',
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Progress bar
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 4,
                      backgroundColor: cs.surfaceContainerHighest,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(cs.primary),
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Step label + chevron
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: cs.primaryContainer.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          _stepLabels[project.currentStep]!,
                          style: TextStyle(
                            color: cs.primary,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const Spacer(),
                      Icon(Icons.arrow_forward_ios,
                          size: 12,
                          color: cs.onSurface.withValues(alpha: 0.3)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Spectrum ring decoration
            Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: SweepGradient(
                      colors: [
                        const Color(0xFF7B2FBE),
                        const Color(0xFF00BCD4),
                        const Color(0xFF4CAF50),
                        const Color(0xFFFF9800),
                        const Color(0xFFF44336),
                        const Color(0xFF7B2FBE),
                      ],
                    ),
                  ),
                ),
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF080E1C),
                  ),
                  child: Icon(
                    Icons.science_outlined,
                    size: 36,
                    color: cs.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text(
              'No experiments yet',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Tap the button below to start\nyour first spectrophotometry experiment.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.45),
                fontSize: 14,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── FAB ───────────────────────────────────────────────────────────────────────

class _NewExperimentFab extends ConsumerWidget {
  const _NewExperimentFab({required this.ref});
  final WidgetRef ref;

  @override
  Widget build(BuildContext context, WidgetRef widgetRef) {
    final cs = Theme.of(context).colorScheme;

    return FloatingActionButton.extended(
      onPressed: () => _showCreateDialog(context, widgetRef),
      backgroundColor: cs.primary,
      foregroundColor: cs.onPrimary,
      elevation: 0,
      icon: const Icon(Icons.add),
      label: const Text(
        'New Experiment',
        style: TextStyle(fontWeight: FontWeight.w600),
      ),
    );
  }

  void _showCreateDialog(BuildContext context, WidgetRef ref) {
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New Experiment'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Experiment name',
            hintText: 'e.g. Copper sulfate analysis',
          ),
          onSubmitted: (_) => _submit(ctx, controller, ref),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => _submit(ctx, controller, ref),
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _submit(BuildContext ctx, TextEditingController c, WidgetRef ref) {
    final name = c.text.trim();
    if (name.isEmpty) return;
    ref.read(projectListProvider.notifier).createProject(name);
    Navigator.pop(ctx);
  }
}
