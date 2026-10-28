import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

class StudentHome extends StatelessWidget {
  const StudentHome({super.key});

  Future<Map<String, dynamic>?> _load() async {
    final me = await myStudent(session.userId, session.schoolId);
    if (me?.klass == null) return null;
    final today = todayJakarta();
    final tas = await sb.from('teaching_assignments').select('id, meeting_url, subjects(name), profiles:teacher_id(full_name)').eq('class_id', me!.klass!.id);
    final taIds = tas.map((t) => t['id'] as String).toList();
    final r = await Future.wait([
      sb.from('schedules').select('id, starts_at, ends_at, room, teaching_assignment_id').inFilter('teaching_assignment_id', taIds).eq('day_of_week', isoDowJakarta()).order('starts_at'),
      sb.from('student_attendance').select('status').eq('student_id', me.id).eq('date', today).isFilter('teaching_assignment_id', null),
      sb.from('assignments').select('id, title, due_at, teaching_assignment_id').inFilter('teaching_assignment_id', taIds)
          .gte('due_at', DateTime.now().toUtc().toIso8601String()).order('due_at').limit(6),
      sb.from('submissions').select('assignment_id').eq('student_id', me.id),
      sb.from('online_sessions').select('id, title, starts_at, url, teaching_assignment_id').inFilter('teaching_assignment_id', taIds)
          .gte('starts_at', DateTime.now().toUtc().subtract(const Duration(hours: 2)).toIso8601String()).order('starts_at').limit(5),
    ]);
    return {
      'me': me, 'today': today,
      'ta': {for (final t in tas) t['id']: t},
      'schedule': r[0], 'att': r[1].firstOrNull, 'assignments': r[2],
      'done': r[3].map((s) => s['assignment_id']).toSet(), 'sessions': r[4],
    };
  }

  @override
  Widget build(BuildContext context) => Loader(
        load: _load,
        builder: (context, d, _) {
          if (d == null) return ListView(children: const [EmptyState('Akun Anda belum terdaftar di kelas. Hubungi admin sekolah.')]);
          final me = d['me'] as StudentRef;
          final ta = d['ta'] as Map;
          final att = d['att'] as Map?;
          return PageList(children: [
            Text('Halo, ${me.fullName.split(' ').first}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            Text('Kelas ${me.klass!.name} · ${tanggal(d['today'], withDay: true)}', style: const TextStyle(color: Palette.muted)),
            StatTile(label: 'Absen hari ini', value: att == null ? const Text('Belum absen') : StatusPill(att['status'])),
            Section(
              title: 'Jadwal ${hari[isoDowJakarta()]}',
              child: (d['schedule'] as List).isEmpty
                  ? const EmptyState('Tidak ada pelajaran hari ini.')
                  : Column(children: [
                      for (final s in d['schedule'] as List)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(ta[s['teaching_assignment_id']]?['subjects']?['name'] ?? ''),
                          subtitle: Text('${jam(s['starts_at'])}–${jam(s['ends_at'])} · ${ta[s['teaching_assignment_id']]?['profiles']?['full_name'] ?? ''}${s['room'] != null ? ' · ${s['room']}' : ''}'),
                          trailing: ta[s['teaching_assignment_id']]?['meeting_url'] == null
                              ? null
                              : TextButton(onPressed: () => launchUrl(Uri.parse(ta[s['teaching_assignment_id']]['meeting_url']), mode: LaunchMode.externalApplication), child: const Text('Kelas online')),
                        ),
                    ]),
            ),
            if ((d['sessions'] as List).isNotEmpty)
              Section(
                title: 'Kelas online terjadwal',
                child: Column(children: [
                  for (final s in d['sessions'] as List)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(s['title']),
                      subtitle: Text('${ta[s['teaching_assignment_id']]?['subjects']?['name'] ?? ''} · ${waktu(s['starts_at'])}'),
                      trailing: FilledButton.tonal(onPressed: () => launchUrl(Uri.parse(s['url']), mode: LaunchMode.externalApplication), child: const Text('Gabung')),
                    ),
                ]),
              ),
            Section(
              title: 'Tugas mendatang',
              child: (d['assignments'] as List).isEmpty
                  ? const EmptyState('Tidak ada tugas dengan tenggat dekat.')
                  : Column(children: [
                      for (final a in d['assignments'] as List)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(a['title']),
                          subtitle: Text('${ta[a['teaching_assignment_id']]?['subjects']?['name'] ?? ''} · Tenggat ${waktu(a['due_at'])}'),
                          trailing: (d['done'] as Set).contains(a['id']) ? const StatusPill('selesai') : const Pill('Belum', tone: Tone.warn),
                        ),
                    ]),
            ),
          ]);
        },
      );
}
