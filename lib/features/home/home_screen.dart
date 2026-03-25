import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/data/repositories/project_repository.dart';

// ── State notifier for the project list ─────────────────────────────────────

class ProjectListNotifier extends StateNotifier<List<Project>> {
  ProjectListNotifier(this._repo) : super([]) {
    refresh();
  }

  final ProjectRepository _repo;

  void createProject(String name) {
    final project = Project(name: name);
    _repo.save(project);
    refresh();
  }

  void deleteProject(String id) {
    _repo.delete(id);
    refresh();
  }

  void refresh() {
    state = _repo.getAll();
  }
}

final projectListProvider =
    StateNotifierProvider<ProjectListNotifier, List<Project>>((ref) {
  final repo = ref.watch(projectRepositoryProvider);
  return ProjectListNotifier(repo);
});

// ── Home screen ─────────────────────────────────────────────────────────────

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Spectro App'),
      ),
      body: projects.isEmpty ? _buildEmptyState(theme) : _buildList(projects, ref, context),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateDialog(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('New Experiment'),
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.science_outlined,
            size: 80,
            color: theme.colorScheme.primary.withValues(alpha: 0.4),
          ),
          const SizedBox(height: 16),
          Text(
            'Create your first experiment',
            style: theme.textTheme.titleMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList(List<Project> projects, WidgetRef ref, BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: projects.length,
      itemBuilder: (context, index) {
        final project = projects[index];
        return _ProjectCard(
          project: project,
          onTap: () {
            Navigator.pushNamed(context, '/workflow', arguments: project.id);
          },
          onDelete: () {
            ref.read(projectListProvider.notifier).deleteProject(project.id);
          },
        );
      },
    );
  }

  void _showCreateDialog(BuildContext context, WidgetRef ref) {
    final controller = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('New Experiment'),
          content: TextField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Experiment name',
              hintText: 'e.g. Copper sulfate analysis',
            ),
            onSubmitted: (_) => _submit(dialogContext, controller, ref),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => _submit(dialogContext, controller, ref),
              child: const Text('Create'),
            ),
          ],
        );
      },
    );
  }

  void _submit(BuildContext dialogContext, TextEditingController controller, WidgetRef ref) {
    final name = controller.text.trim();
    if (name.isEmpty) return;
    ref.read(projectListProvider.notifier).createProject(name);
    Navigator.pop(dialogContext);
  }
}

// ── Project card ────────────────────────────────────────────────────────────

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({
    required this.project,
    required this.onTap,
    required this.onDelete,
  });

  final Project project;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  String _stepLabel(WorkflowStep step) {
    switch (step) {
      case WorkflowStep.setup:
        return 'Setup';
      case WorkflowStep.calibration:
        return 'Wavelength Calibration';
      case WorkflowStep.references:
        return 'Reference Captures';
      case WorkflowStep.unknown:
        return 'Unknown Capture';
      case WorkflowStep.results:
        return 'Results';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateStr =
        '${project.updatedAt.day}/${project.updatedAt.month}/${project.updatedAt.year}';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.science, color: theme.colorScheme.primary),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      project.name,
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Step: ${_stepLabel(project.currentStep)}  •  $dateStr',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20),
                onPressed: onDelete,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
