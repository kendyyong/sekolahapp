import 'package:flutter_test/flutter_test.dart';
import 'package:sekolahapp_mobile/features/shared/report_screens.dart';

void main() {
  test('deskripsi projek kokurikuler dikelompokkan dari predikat tertinggi', () {
    final aspects = [
      {'dimension': 'Kreativitas', 'element': null, 'level': 'SB'},
      {'dimension': 'Kolaborasi', 'element': null, 'level': 'BSH'},
      {'dimension': 'Kesehatan', 'element': null, 'level': 'MB'},
      {'dimension': 'Keimanan dan ketakwaan terhadap Tuhan YME', 'element': null, 'level': 'SB'},
    ];
    expect(projectNarrative('Andi', aspects),
        'Ananda Andi sangat berkembang dalam kreativitas dan keimanan dan ketakwaan terhadap Tuhan YME; '
        'berkembang sesuai harapan dalam kolaborasi; mulai berkembang dalam kesehatan.');
  });

  test('P5 memakai nama elemen; belum dinilai menghasilkan teks kosong', () {
    expect(projectNarrative('Bela', [
      {'dimension': 'Bergotong royong', 'element': 'Kolaborasi', 'level': 'BB'},
    ]), 'Ananda Bela belum berkembang dalam kolaborasi.');
    expect(projectNarrative('Citra', [
      {'dimension': 'Kreatif', 'element': 'Menghasilkan gagasan yang orisinal', 'level': null},
    ]), '');
  });
}
