import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sekolahapp_mobile/core/format.dart';

void main() {
  setUpAll(() => initializeDateFormatting('id_ID'));

  test('rupiah tanpa desimal dengan pemisah titik', () {
    expect(rupiah(475000).replaceAll(' ', ' '), 'Rp475.000');
    expect(rupiah(null), 'Rp0');
  });

  test('tanggal dalam bahasa Indonesia', () {
    expect(tanggal('2026-10-29'), '29 Okt 2026');
    expect(tanggal('2026-10-29', withDay: true), 'Kamis, 29 Okt 2026');
  });

  test('waktu dikonversi ke Asia/Jakarta', () {
    expect(waktu('2026-10-28T17:30:00Z'), '29 Okt, 00.30');
  });

  test('jam dari kolom time', () => expect(jam('07:15:00'), '07.15'));

  test('label dan warna status sama dengan dasbor web', () {
    expect(statusLabel['paid'], 'Lunas');
    expect(statusTone['alpa'], Tone.bad);
  });
}
