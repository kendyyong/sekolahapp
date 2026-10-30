import 'package:flutter/material.dart';

import '../app.dart';
import '../core/session.dart';
import '../core/supa.dart';
import '../core/ui.dart';
import 'guardian/guardian_home.dart';
import 'guardian/guardian_invoices.dart';
import 'guardian/guardian_leave.dart';
import 'guardian/guardian_messages.dart';
import 'shared/announcements_screen.dart';
import 'shared/notifications_screen.dart';
import 'shared/profile_screen.dart';
import 'student/student_checkin.dart';
import 'student/student_fees.dart';
import 'student/student_groups.dart';
import 'student/student_home.dart';
import 'student/student_tasks.dart';
import 'teacher/staff_self.dart';
import 'teacher/teacher_attendance.dart';
import 'teacher/teacher_home.dart';
import 'teacher/teacher_leave_review.dart';
import 'teacher/teacher_messages.dart';

class _Tab {
  const _Tab(this.label, this.icon, this.page, {this.module});
  final String label;
  final IconData icon;
  final Widget page;

  /// Tab hanya tampil bila paket sekolah memuat modul ini.
  final String? module;
}

List<_Tab> _tabsFor(String role) => switch (role) {
      'student' => const [
          _Tab('Beranda', Icons.home_outlined, StudentHome()),
          _Tab('Absen', Icons.qr_code_scanner, StudentCheckIn()),
          _Tab('Tugas', Icons.assignment_outlined, StudentTasks()),
          _Tab('Kelompok', Icons.groups_outlined, StudentGroups()),
          _Tab('Biaya', Icons.receipt_long_outlined, StudentFees(), module: 'finance'),
        ],
      'guardian' => const [
          _Tab('Anak', Icons.child_care_outlined, GuardianHome()),
          _Tab('Izin', Icons.sick_outlined, GuardianLeave()),
          _Tab('Tagihan', Icons.payments_outlined, GuardianInvoices(), module: 'finance'),
          _Tab('Pesan', Icons.chat_bubble_outline, GuardianMessages()),
          _Tab('Info', Icons.campaign_outlined, InfoScreen()),
        ],
      'teacher' => const [
          _Tab('Beranda', Icons.home_outlined, TeacherHome()),
          _Tab('Absensi', Icons.fact_check_outlined, TeacherAttendance()),
          _Tab('Izin', Icons.mark_email_unread_outlined, TeacherLeaveReview()),
          _Tab('Pesan', Icons.chat_bubble_outline, TeacherMessages()),
          _Tab('Absen Saya', Icons.badge_outlined, StaffSelf(), module: 'staff'),
        ],
      _ => const [_Tab('Info', Icons.campaign_outlined, _WebOnly())],
    };

/// Kerangka aplikasi untuk peran aktif: navigasi bawah + notifikasi + profil.
class RoleShell extends StatefulWidget {
  const RoleShell({super.key});
  @override
  State<RoleShell> createState() => _RoleShellState();
}

class _RoleShellState extends State<RoleShell> {
  int _index = 0;
  int _unread = 0;
  late final List<_Tab> _tabs = [
    for (final t in _tabsFor(session.active!.role))
      if (t.module == null || session.modules.contains(t.module)) t,
  ];

  @override
  void initState() {
    super.initState();
    _countUnread();
    _checkStudentMode();
  }

  Future<void> _countUnread() async {
    try {
      final n = await sb.from('notifications').count().eq('user_id', session.userId).isFilter('read_at', null);
      if (mounted) setState(() => _unread = n);
    } catch (_) {}
  }

  /// Sekolah yang mematikan aplikasi murid: murid hanya melihat pemberitahuan.
  bool _studentAppOff = false;

  Future<void> _checkStudentMode() async {
    if (session.active!.role != 'student') return;
    try {
      final mode = await sb.rpc('student_app_mode', params: {'p_school': session.schoolId});
      if (mounted && mode == 'off') setState(() => _studentAppOff = true);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final a = session.active!;
    if (_studentAppOff) {
      return Scaffold(
        appBar: AppBar(titleSpacing: 16, title: Row(children: [
          SchoolLogo(name: a.schoolName, url: session.logoUrl),
          const SizedBox(width: 12),
          Expanded(child: Text(session.appName ?? a.schoolName, overflow: TextOverflow.ellipsis)),
        ]), actions: [
          IconButton(
            tooltip: 'Profil & ganti peran',
            icon: const Icon(Icons.account_circle_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
          ),
        ]),
        body: const EmptyState(
          'Aplikasi murid tidak dipakai di sekolahmu.\nAbsen lewat kartu pelajar dan guru, tugas dikumpulkan langsung ke guru, '
          'dan info tugas serta nilai dikirim ke orang tuamu.',
          icon: Icons.phonelink_off,
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(children: [
          SchoolLogo(name: a.schoolName, url: session.logoUrl),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_tabs[_index].label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              Text('${roleLabel[a.role]} · ${session.appName ?? a.schoolName}',
                  overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Palette.muted)),
            ]),
          ),
        ]),
        actions: [
          IconButton(
            tooltip: 'Notifikasi',
            icon: Badge(isLabelVisible: _unread > 0, label: Text('$_unread'), child: const Icon(Icons.notifications_outlined)),
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()));
              _countUnread();
            },
          ),
          IconButton(
            tooltip: 'Profil & ganti peran',
            icon: const Icon(Icons.account_circle_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: [for (final t in _tabs) t.page]),
      bottomNavigationBar: _tabs.length < 2
          ? null
          : NavigationBar(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [for (final t in _tabs) NavigationDestination(icon: Icon(t.icon), label: t.label)],
            ),
    );
  }
}

class _WebOnly extends StatelessWidget {
  const _WebOnly();
  @override
  Widget build(BuildContext context) => Column(children: [
        Container(
          width: double.infinity,
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
          padding: const EdgeInsets.all(12),
          child: Text(
            'Fitur ${roleLabel[session.active!.role]} tersedia lengkap di dasbor web. Di aplikasi ini Anda bisa membaca pengumuman, kalender pendidikan, dan notifikasi.',
            style: TextStyle(color: Theme.of(context).colorScheme.primary),
          ),
        ),
        const Expanded(child: InfoScreen()),
      ]);
}
