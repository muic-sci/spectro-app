import 'package:flutter_test/flutter_test.dart';
import 'package:spectro_app/core/utils/join_link.dart';

void main() {
  group('parseJoinLink', () {
    test('parses a standard join URL into base + token', () {
      final t = parseJoinLink('http://192.168.1.8:3000/join/ABC123');
      expect(t, isNotNull);
      expect(t!.baseUrl, 'http://192.168.1.8:3000');
      expect(t.token, 'ABC123');
    });

    test('handles https and trailing slash', () {
      final t = parseJoinLink('https://spectro.example.com/join/XYZ789/');
      expect(t!.baseUrl, 'https://spectro.example.com');
      expect(t.token, 'XYZ789');
    });

    test('trims surrounding whitespace', () {
      final t = parseJoinLink('  http://host:3000/join/TOK  ');
      expect(t!.token, 'TOK');
    });

    test('rejects non-join URLs and junk', () {
      expect(parseJoinLink('http://host:3000/experiments/x'), isNull);
      expect(parseJoinLink('not a url'), isNull);
      expect(parseJoinLink('spectro://join/abc'), isNull); // wrong scheme
      expect(parseJoinLink('http://host:3000/join/'), isNull); // missing token
    });
  });
}
