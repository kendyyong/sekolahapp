import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'supa.dart';

const roleLabel = <String, String>{
  'school_admin': 'Admin Sekolah',
  'principal': 'Kepala Sekolah',
  'teacher': 'Guru',
  'counselor': 'Guru BK',
  'finance': 'Tata Usaha',
  'canteen': 'Petugas Kantin',
  'student': 'Murid',
  'guardian': 'Orang Tua',
};

/// Peran yang punya tampilan di aplikasi HP. Peran lain memakai dasbor web.
const mobileRoles = {'student', 'guardian', 'teacher'};

class RoleOption {
  RoleOption(this.schoolId, this.schoolName, this.role);
  final String schoolId;
  final String schoolName;
  final String role;
  String get key => '$schoolId|$role';
}

/// Sesi aplikasi: profil, daftar peran (satu akun bisa banyak peran), dan peran aktif.
class AppSession extends ChangeNotifier {
  static const _prefKey = 'active_role';

  User? get user => sb.auth.currentUser;
  String get userId => user!.id;
  Map<String, dynamic>? profile;
  List<RoleOption> roles = [];
  RoleOption? active;
  bool loading = false;

  /// Super admin platform; dasbornya hanya ada di web.
  bool platformAdmin = false;

  /// Modul paket langganan sekolah aktif (core, staff, finance, …).
  Set<String> modules = {};

  /// Merek sekolah aktif (RPC school_brand): logo, moto, dan, untuk paket Enterprise, warna & nama aplikasi.
  Map<String, dynamic>? brand;
  String? get logoUrl => brand?['logo_url'] as String?;
  String? get motto => brand?['motto'] as String?;
  String? get appName => brand?['app_name'] as String?;
  Color? get brandColor {
    final hex = brand?['brand_color'] as String?;
    return hex == null ? null : Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);
  }

  String get schoolId => active!.schoolId;
  String get firstName => (profile?['full_name'] as String? ?? '').split(' ').first;

  Future<void> load() async {
    if (user == null) return;
    loading = true;
    notifyListeners();
    try {
      final results = await Future.wait<dynamic>([
        sb.from('profiles').select('id, full_name, email, phone, avatar_url').eq('id', userId).single(),
        sb.rpc('my_roles'),
        sb.rpc('is_platform_admin'),
      ]);
      profile = results[0] as Map<String, dynamic>;
      roles = (results[1] as List)
          .map((r) => RoleOption(r['school_id'] as String, r['school_name'] as String, r['role'] as String))
          .toList();
      platformAdmin = results[2] == true;
      final saved = (await SharedPreferences.getInstance()).getString(_prefKey);
      active = roles.where((r) => r.key == saved).firstOrNull ??
          roles.where((r) => mobileRoles.contains(r.role)).firstOrNull ??
          roles.firstOrNull;
      await _loadSchool();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> _loadSchool() async {
    final a = active;
    if (a == null) {
      modules = {};
      brand = null;
      return;
    }
    final r = await Future.wait<dynamic>([
      sb.rpc('school_modules', params: {'p_school': a.schoolId}),
      sb.rpc('school_brand', params: {'p_school': a.schoolId}),
    ]);
    modules = {...(r[0] as List).cast<String>()};
    brand = r[1] as Map<String, dynamic>?;
  }

  Future<void> switchTo(RoleOption r) async {
    active = r;
    (await SharedPreferences.getInstance()).setString(_prefKey, r.key);
    await _loadSchool();
    notifyListeners();
  }

  Future<void> signOut() async {
    await sb.auth.signOut();
    profile = null;
    roles = [];
    active = null;
    platformAdmin = false;
    modules = {};
    brand = null;
    notifyListeners();
  }
}
