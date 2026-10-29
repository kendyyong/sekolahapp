import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'supa.dart';

const roleLabel = <String, String>{
  'school_admin': 'Admin Sekolah',
  'principal': 'Kepala Sekolah',
  'teacher': 'Guru',
  'counselor': 'Guru BK',
  'finance': 'Tata Usaha',
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

  /// Modul paket langganan sekolah aktif (core, staff, finance, …).
  Set<String> modules = {};

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
      ]);
      profile = results[0] as Map<String, dynamic>;
      roles = (results[1] as List)
          .map((r) => RoleOption(r['school_id'] as String, r['school_name'] as String, r['role'] as String))
          .toList();
      final saved = (await SharedPreferences.getInstance()).getString(_prefKey);
      active = roles.where((r) => r.key == saved).firstOrNull ??
          roles.where((r) => mobileRoles.contains(r.role)).firstOrNull ??
          roles.firstOrNull;
      await _loadModules();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> _loadModules() async {
    final a = active;
    modules = a == null ? {} : {...(await sb.rpc('school_modules', params: {'p_school': a.schoolId}) as List).cast<String>()};
  }

  Future<void> switchTo(RoleOption r) async {
    active = r;
    (await SharedPreferences.getInstance()).setString(_prefKey, r.key);
    await _loadModules();
    notifyListeners();
  }

  Future<void> signOut() async {
    await sb.auth.signOut();
    profile = null;
    roles = [];
    active = null;
    modules = {};
    notifyListeners();
  }
}
