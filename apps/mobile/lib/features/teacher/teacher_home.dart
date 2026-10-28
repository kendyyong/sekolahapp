import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

/// Murid di kelas perwalian guru ini (tahun ajaran aktif).
Future<List<String>> homeroomStudentIds() async {
  final rows = await sb.from('classes').select('id, enrollments(student_id), academic_years!inner(is_active)')
      .eq('homeroom_teacher_id', session.userId).eq('school_id', session.schoolId).eq('academic_years.is_active', true);
  return [for (final c in rows) for (final e in (c['enrollments'] as List)) e['student_id'] as String];
}

class TeacherHome extends StatelessWidget {
  const TeacherHome({super.key});

  Future<Map<String, dynamic>> _load() async {
    final tas = await sb.from('teaching_assignments').select('id, meeting_url, classes!inner(name), subjects!inner(name)').eq('teacher_id', session.userId);
    final taIds = tas.map((t) => t['id'] as String).toList();
    final students = await homeroomStudentIds();
    final r = await Future.wait<dynamic>([
      taIds.isEmpty
          ? Future.value(<Map<String, dynamic>>[])
          : sb.from('schedules').select('id, starts_at, ends_at, room, teaching_assignment_id').inFilter('teaching_assignment_id', taIds).eq('day_of_week', isoDowJakarta()).order('starts_at'),
      students.isEmpty ? Future.value(0) : sb.from('student_leave_requests').count().inFilter('student_id', students).eq('status', 'pending'),
      taIds.isEmpty ? Future.value(<Map<String, dynamic>>[]) : sb.from('submissions').select('id, assignments!inner(teaching_assignment_id)').isFilter('score', null).inFilter('assignments.teaching_assignment_id', taIds),
      sb.from('directive_recipients').select('status, directives(title, due_on)').eq('user_id', session.userId).eq('status', 'baru'),
    ]);
    return {'ta': {for (final t in tas) t['id']: t}, 'schedule': r[0], 'pendingLeave': r[1], 'toGrade': (r[2] as List).length, 'directives': r[3]};
  }

  @override
  Widget build(BuildContext context) => Loader(
        load: _load,
        builder: (context, d, _) {
          final ta = d['ta'] as Map;
          final schedule = d['schedule'] as List;
          final directives = d['directives'] as List;
          return PageList(children: [
            Text('Selamat datang, ${session.firstName}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            Text(tanggal(todayJakarta(), withDay: true), style: const TextStyle(color: Palette.muted)),
            Row(children: [
              Expanded(child: StatTile(label: 'Izin menunggu', value: Text('${d['pendingLeave']}'), tone: (d['pendingLeave'] as int) > 0 ? Tone.warn : null)),
              const SizedBox(width: 12),
              Expanded(child: StatTile(label: 'Belum dinilai', value: Text('${d['toGrade']}'))),
            ]),
            if (directives.isNotEmpty)
              Section(
                title: 'Arahan kepala sekolah',
                child: Column(children: [
                  for (final x in directives)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.campaign_outlined, color: Palette.accent),
                      title: Text(x['directives']?['title'] ?? ''),
                      subtitle: Text('Tenggat ${tanggal(x['directives']?['due_on'])} · laporkan lewat dasbor web'),
                    ),
                ]),
              ),
            Section(
              title: 'Mengajar ${hari[isoDowJakarta()]}',
              child: schedule.isEmpty
                  ? const EmptyState('Tidak ada jadwal mengajar hari ini.')
                  : Column(children: [
                      for (final s in schedule)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('${ta[s['teaching_assignment_id']]?['subjects']?['name']} · ${ta[s['teaching_assignment_id']]?['classes']?['name']}'),
                          subtitle: Text('${jam(s['starts_at'])}–${jam(s['ends_at'])}${s['room'] != null ? ' · ${s['room']}' : ''}'),
                          trailing: ta[s['teaching_assignment_id']]?['meeting_url'] == null
                              ? null
                              : IconButton(
                                  tooltip: 'Buka kelas online',
                                  icon: const Icon(Icons.videocam_outlined),
                                  onPressed: () => launchUrl(Uri.parse(ta[s['teaching_assignment_id']]['meeting_url']), mode: LaunchMode.externalApplication),
                                ),
                        ),
                    ]),
            ),
            const Text('Membuat tugas, menilai, dan verifikasi kelompok tersedia di dasbor web.', style: TextStyle(fontSize: 12, color: Palette.muted), textAlign: TextAlign.center),
          ]);
        },
      );
}
