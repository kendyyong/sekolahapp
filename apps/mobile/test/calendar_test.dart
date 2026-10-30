import 'package:flutter_test/flutter_test.dart';
import 'package:sekolahapp_mobile/features/shared/calendar_screen.dart';

void main() {
  test('rentang tanggal agenda sama dengan versi web', () {
    expect(rangeLabel('2026-11-03', '2026-11-03'), '3 Nov 2026');
    expect(rangeLabel('2026-11-03', '2026-11-05'), '3–5 Nov 2026');
    expect(rangeLabel('2026-11-28', '2026-12-02'), '28 Nov – 2 Des 2026');
    expect(rangeLabel('2026-12-28', '2027-01-02'), '28 Des 2026 – 2 Jan 2027');
  });

  test('libur khusus guru tidak dihitung libur murid', () {
    final events = [
      {'title': 'Libur semester', 'kind': 'libur', 'audience': 'all', 'starts_on': '2026-12-21', 'ends_on': '2027-01-02'},
      {'title': 'Rapat', 'kind': 'kegiatan', 'audience': 'all', 'starts_on': '2026-12-22', 'ends_on': '2026-12-22'},
      {'title': 'Libur guru', 'kind': 'libur', 'audience': 'staff', 'starts_on': '2026-12-22', 'ends_on': '2026-12-22'},
    ];
    expect(holidaysOn(events, '2026-12-22').map((e) => e['title']), ['Libur semester']);
    expect(holidaysOn(events, '2027-01-03'), isEmpty);
  });
}
