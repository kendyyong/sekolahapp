import 'package:supabase_flutter/supabase_flutter.dart';

SupabaseClient get sb => Supabase.instance.client;

/// Jalankan [fn]; ubah error Supabase menjadi pesan yang bisa dibaca pengguna.
Future<T> guard<T>(Future<T> Function() fn) async {
  try {
    return await fn();
  } on PostgrestException catch (e) {
    throw AppError(e.message);
  } on StorageException catch (e) {
    throw AppError('Gagal mengunggah berkas: ${e.message}');
  } on FunctionException catch (e) {
    final d = e.details;
    final msg = d is Map ? (d['error'] ?? d['message']) : null;
    throw AppError(msg?.toString() ?? 'Layanan sedang tidak tersedia. Coba beberapa saat lagi.');
  } on AuthException catch (e) {
    throw AppError(_authMessages[e.code] ?? e.message);
  }
}

class AppError implements Exception {
  AppError(this.message);
  final String message;
  @override
  String toString() => message;
}

const _authMessages = {
  'invalid_credentials': 'Email atau kata sandi salah.',
  'email_not_confirmed': 'Email belum dikonfirmasi. Periksa kotak masuk Anda.',
  'over_request_rate_limit': 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
  'weak_password': 'Kata sandi terlalu lemah.',
  'same_password': 'Kata sandi baru harus berbeda dari yang lama.',
};
