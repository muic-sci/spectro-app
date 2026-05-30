import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:spectro_app/app.dart';

void main() {
  testWidgets('App launches and shows home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: SpectroApp()));
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
