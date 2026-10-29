import 'package:flutter/material.dart';

import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import '../shared/canteen_section.dart';
import '../shared/report_screens.dart';
import 'children.dart';

String _hhmm(String iso) => waktu(iso).split(', ').last;

class _TaskTile extends StatelessWidget {
  const _TaskTile(this.t);
  final Map t;
  @override
  Widget build(BuildContext context) {
    final sub = (t['submissions'] as List).firstOrNull;
    final overdue = t['due_at'] != null && DateTime.parse(t['due_at']).isBefore(DateTime.now());
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(t['title']),
      subtitle: Text('${t['teaching_assignments']?['subjects']?['name'] ?? ''} · Tenggat ${waktu(t['due_at'])}'),
      trailing: sub?['score'] != null
          ? Text('${sub['score']}/${t['max_score']}', style: const TextStyle(fontWeight: FontWeight.w800))
          : sub != null
              ? Pill(sub['mode'] == 'offline' ? 'Dikumpulkan ke guru' : 'Sudah dikumpulkan', tone: Tone.info)
              : Pill('Belum dikumpulkan', tone: overdue ? Tone.bad : Tone.warn),
    );
  }
}

class GuardianHome extends StatelessWidget {
  const GuardianHome({super.key});

  Future<Map<String, dynamic>> _load(StudentRef c) async {
    final today = todayJakarta();
    final r = await Future.wait([
      sb.from('student_attendance').select('date, status, checked_in_at, checked_out_at').eq('student_id', c.id).isFilter('teaching_assignment_id', null).gte('date', '${today.substring(0, 8)}01').order('date', ascending: false),
      sb.from('submissions').select('id, score, graded_at, assignments(title, max_score, teaching_assignments(subjects(name)))')
          .eq('student_id', c.id).not('score', 'is', null).order('graded_at', ascending: false).limit(6),
      sb.from('invoices').select('total, paid_amount').eq('student_id', c.id).inFilter('status', ['unpaid', 'partial']),
      sb.from('behavior_records').select('id, kind, points, description, occurred_on').eq('student_id', c.id).order('occurred_on', ascending: false).limit(6),
      sb.from('student_leave_requests').select('id').eq('student_id', c.id).eq('status', 'pending'),
      // Tugas kelas anak sepekan terakhir & mendatang: penting bila anak tidak memakai aplikasi.
      c.klass == null
          ? Future.value(<Map<String, dynamic>>[])
          : sb.from('assignments')
              .select('id, title, due_at, max_score, teaching_assignments!inner(class_id, subjects(name)), submissions(student_id, score, mode)')
              .eq('teaching_assignments.class_id', c.klass!.id).eq('submissions.student_id', c.id)
              .or('due_at.gte.${DateTime.now().toUtc().subtract(const Duration(days: 7)).toIso8601String()},due_at.is.null')
              .order('due_at', ascending: true, nullsFirst: false).limit(8),
    ]);
    return {'today': today, 'att': r[0], 'grades': r[1], 'owed': r[2].fold<num>(0, (s, i) => s + (i['total'] as num) - (i['paid_amount'] as num)), 'behavior': r[3], 'pendingLeave': r[4].length, 'tasks': r[5]};
  }

  @override
  Widget build(BuildContext context) => ChildScope(
        builder: (context, c) => Loader(
          load: () => _load(c),
          builder: (context, d, _) {
            final att = d['att'] as List;
            int count(List<String> s) => att.where((a) => s.contains(a['status'])).length;
            final today = att.where((a) => a['date'] == d['today']).firstOrNull;
            final owed = d['owed'] as num;
            return PageList(children: [
              Text(c.fullName, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              Text('${c.klass != null ? 'Kelas ${c.klass!.name}' : 'Belum terdaftar di kelas'} · ${tanggal(d['today'], withDay: true)}', style: const TextStyle(color: Palette.muted)),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.7,
                children: [
                  StatTile(
                    label: 'Hari ini',
                    value: today == null
                        ? const Text('Belum absen', style: TextStyle(fontSize: 16))
                        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            StatusPill(today['status']),
                            if (today['checked_in_at'] != null)
                              Text(
                                'Tiba ${_hhmm(today['checked_in_at'])}${today['checked_out_at'] != null ? ' · pulang ${_hhmm(today['checked_out_at'])}' : ''}',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: Palette.muted),
                              ),
                          ]),
                  ),
                  StatTile(label: 'Hadir bulan ini', value: Text('${count(['hadir', 'terlambat'])}')),
                  StatTile(label: 'Izin / Sakit / Alpa', value: Text('${count(['izin'])} / ${count(['sakit'])} / ${count(['alpa'])}'), tone: count(['alpa']) > 0 ? Tone.bad : null),
                  StatTile(label: 'Belum lunas', value: FittedBox(child: Text(rupiah(owed))), tone: owed > 0 ? Tone.warn : Tone.good),
                ],
              ),
              if ((d['pendingLeave'] as int) > 0)
                Card(color: Palette.warnSoft, child: Padding(padding: const EdgeInsets.all(12), child: Text('${d['pendingLeave']} pengajuan izin menunggu persetujuan wali kelas.', style: const TextStyle(color: Palette.warn)))),
              Section(
                title: 'Tugas & PR',
                child: (d['tasks'] as List).isEmpty
                    ? const EmptyState('Tidak ada tugas dalam sepekan ini.')
                    : Column(children: [for (final t in d['tasks'] as List) _TaskTile(t)]),
              ),
              ReportsSection(studentId: c.id, studentName: c.fullName),
              CanteenSection(studentId: c.id, guardian: true),
              Section(
                title: 'Nilai terbaru',
                child: (d['grades'] as List).isEmpty
                    ? const EmptyState('Belum ada nilai.')
                    : Column(children: [
                        for (final g in d['grades'] as List)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(g['assignments']?['title'] ?? ''),
                            subtitle: Text('${g['assignments']?['teaching_assignments']?['subjects']?['name'] ?? ''} · ${waktu(g['graded_at'])}'),
                            trailing: Text('${g['score']}/${g['assignments']?['max_score']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          ),
                      ]),
              ),
              Section(
                title: 'Prestasi & catatan sikap',
                child: (d['behavior'] as List).isEmpty
                    ? const EmptyState('Belum ada catatan.')
                    : Column(children: [
                        for (final b in d['behavior'] as List)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(b['description']),
                            subtitle: Text(tanggal(b['occurred_on'])),
                            trailing: Pill('${b['kind'] == 'prestasi' ? 'Prestasi' : 'Pelanggaran'} · ${b['points']}', tone: b['kind'] == 'prestasi' ? Tone.good : Tone.bad),
                          ),
                      ]),
              ),
              Section(
                title: 'Absen bulan ini',
                child: att.isEmpty
                    ? const EmptyState('Belum ada data absen bulan ini.')
                    : Wrap(spacing: 6, runSpacing: 6, children: [
                        for (final a in att.reversed)
                          Column(mainAxisSize: MainAxisSize.min, children: [StatusPill(a['status']), Text((a['date'] as String).substring(8), style: const TextStyle(fontSize: 11, color: Palette.muted))]),
                      ]),
              ),
            ]);
          },
        ),
      );
}
