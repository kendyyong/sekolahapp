import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'supa.dart';

/// Mendaftarkan token FCM ke tabel `device_tokens`. Notifikasi dikirim oleh Edge Function `push-dispatch`.
/// Butuh google-services.json (Android) / GoogleService-Info.plist (iOS); tanpa itu dilewati diam-diam.
class Push {
  static bool _ready = false;

  static Future<void> register() async {
    if (kIsWeb) return;
    try {
      if (!_ready) {
        await Firebase.initializeApp();
        _ready = true;
        // push-dispatch mengirim lewat FCM HTTP v1 ke registration token, jadi tetap memakai getToken/onTokenRefresh.
        // ignore: deprecated_member_use
        FirebaseMessaging.instance.onTokenRefresh.listen(_save);
      }
      final fm = FirebaseMessaging.instance;
      await fm.requestPermission();
      // ignore: deprecated_member_use
      final token = await fm.getToken();
      if (token != null) await _save(token);
    } catch (e) {
      debugPrint('Push tidak aktif: $e');
    }
  }

  static Future<void> _save(String token) async {
    final uid = sb.auth.currentUser?.id;
    if (uid == null) return;
    await sb.from('device_tokens').upsert({
      'token': token,
      'user_id': uid,
      'platform': Platform.isIOS ? 'ios' : 'android',
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    });
  }

  static Future<void> unregister() async {
    if (!_ready) return;
    try {
      // ignore: deprecated_member_use
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await sb.from('device_tokens').delete().eq('token', token);
    } catch (_) {}
  }
}
