import 'package:flutter/material.dart';

import 'package:spectro_app/core/constants/app_theme.dart';
import 'package:spectro_app/features/home/home_screen.dart';
import 'package:spectro_app/features/workflow/workflow_screen.dart';

class SpectroApp extends StatelessWidget {
  const SpectroApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Spectro App',
      theme: AppTheme.dark,
      debugShowCheckedModeBanner: false,
      initialRoute: '/',
      routes: {
        '/': (context) => const HomeScreen(),
        '/workflow': (context) {
          final projectId =
              ModalRoute.of(context)!.settings.arguments as String;
          return WorkflowScreen(projectId: projectId);
        },
      },
    );
  }
}
