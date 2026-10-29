import 'package:flutter_test/flutter_test.dart';
import 'package:sekolahapp_mobile/features/shared/payslip_section.dart';

void main() {
  test('periode slip dalam bahasa Indonesia', () {
    expect(periodLabel('2026-10-01'), 'Oktober 2026');
    expect(periodLabel('2027-01-01'), 'Januari 2027');
  });

  test('rincian baris slip sama dengan versi web', () {
    String norm(String s) => s.replaceAll(RegExp(r'Rp[\s ]*'), 'Rp');
    expect(norm(lineDetail({'calc': 'per_attendance', 'qty': 20, 'rate': 15000})), '20 hari × Rp15.000');
    expect(norm(lineDetail({'calc': 'per_jp', 'qty': 16, 'rate': 30000})), '16 JP × Rp30.000');
    expect(lineDetail({'calc': 'percent_base', 'qty': null, 'rate': 1}), '1% × gaji pokok');
    expect(lineDetail({'calc': 'percent_base', 'qty': null, 'rate': 2.5}), '2.5% × gaji pokok');
    expect(lineDetail({'calc': 'fixed', 'qty': 1, 'rate': 250000}), '');
  });
}
