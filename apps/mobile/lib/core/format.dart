import 'package:intl/intl.dart';

final _rupiah = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp', decimalDigits: 0);
String rupiah(num? v) => _rupiah.format(v ?? 0);

DateTime _jakarta(DateTime t) => t.toUtc().add(const Duration(hours: 7));

/// Tanggal hari ini di Asia/Jakarta (yyyy-MM-dd), sama seperti `school_today()` di database.
String todayJakarta() => DateFormat('yyyy-MM-dd').format(_jakarta(DateTime.now()));

String tanggal(String? isoDate, {bool withDay = false}) {
  if (isoDate == null) return '–';
  final d = DateTime.parse(isoDate.length == 10 ? '${isoDate}T12:00:00' : isoDate);
  return DateFormat(withDay ? 'EEEE, d MMM yyyy' : 'd MMM yyyy', 'id_ID').format(d);
}

String waktu(String? iso) {
  if (iso == null) return '–';
  return DateFormat('d MMM, HH.mm', 'id_ID').format(_jakarta(DateTime.parse(iso)));
}

String jam(String? hhmmss) => hhmmss == null ? '' : hhmmss.substring(0, 5).replaceAll(':', '.');

/// 1 = Senin … 7 = Minggu, sesuai kolom `schedules.day_of_week`.
int isoDowJakarta() => _jakarta(DateTime.now()).weekday;

const hari = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const statusLabel = <String, String>{
  'pending': 'Menunggu', 'approved': 'Disetujui', 'rejected': 'Ditolak', 'cancelled': 'Dibatalkan',
  'draft': 'Draf', 'revision': 'Perlu perbaikan', 'verified': 'Terverifikasi',
  'unpaid': 'Belum bayar', 'partial': 'Sebagian', 'paid': 'Lunas', 'void': 'Batal', 'expired': 'Kedaluwarsa', 'failed': 'Gagal',
  'hadir': 'Hadir', 'terlambat': 'Terlambat', 'izin': 'Izin', 'sakit': 'Sakit', 'alpa': 'Alpa', 'cuti': 'Cuti', 'dinas': 'Dinas',
  'baru': 'Baru', 'dikerjakan': 'Dikerjakan', 'selesai': 'Selesai',
  'invited': 'Diundang', 'accepted': 'Bergabung', 'declined': 'Menolak',
};

enum Tone { neutral, good, warn, bad, info }

const statusTone = <String, Tone>{
  'pending': Tone.warn, 'approved': Tone.good, 'rejected': Tone.bad, 'revision': Tone.warn, 'verified': Tone.good,
  'unpaid': Tone.warn, 'partial': Tone.info, 'paid': Tone.good, 'failed': Tone.bad,
  'hadir': Tone.good, 'terlambat': Tone.warn, 'izin': Tone.info, 'sakit': Tone.info, 'alpa': Tone.bad, 'cuti': Tone.info, 'dinas': Tone.info,
  'baru': Tone.warn, 'dikerjakan': Tone.info, 'selesai': Tone.good,
  'invited': Tone.warn, 'accepted': Tone.good,
};
