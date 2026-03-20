import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/project.dart';

/// Simple in-memory repository for [Project] objects.
///
/// A persistent (Hive-backed) implementation can replace this later without
/// changing the public API.
class ProjectRepository {
  final Map<String, Project> _store = {};

  /// Returns all projects ordered by most-recently updated first.
  List<Project> getAll() {
    final projects = _store.values.toList();
    projects.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return projects;
  }

  /// Returns the project with the given [id], or `null` if not found.
  Project? getById(String id) => _store[id];

  /// Inserts or updates [project] in the store keyed by its [Project.id].
  void save(Project project) {
    _store[project.id] = project;
  }

  /// Removes the project with the given [id]. No-op if it does not exist.
  void delete(String id) {
    _store.remove(id);
  }
}

/// Riverpod provider for the in-memory [ProjectRepository].
final projectRepositoryProvider = Provider<ProjectRepository>(
  (ref) => ProjectRepository(),
);
