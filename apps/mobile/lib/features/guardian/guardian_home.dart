import 'package:flutter/material.dart';

import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import 'children.dart';

class GuardianHome extends StatelessWidget {
  const GuardianHome({super.key});

  Future<Map<String, dynamic>> _load(StudentRef c) async {
    final today = todayJakarta();
    final r = await Future.wait([
      sb.from('student_attendance').select('date, status').eq('student_id', c.id).isFilter('teaching_assignment_id', null).gte('date', '${today.substring(0, 8)}01').order('date', ascending: false),
      sb.from('submissions').select('id, score, graded_at, assignments(title, max_score, teaching_assignments(subjects(name)))')
          .eq('student_id', c.id).not('score', 'is', null).order('graded_at', ascending: false).limit(6),
      sb.from('invoices').select('total, paid_amount').eq('student_id', c.id).inFilter('status', ['unpaid', 'partial']),
      sb.from('behavior_records').select('id, kind, points, description, occurred_on').eq('student_id', c.id).order('occurred_on', ascending: false).limit(6),
      sb.from('student_leave_requests').select('id').eq('student_id', c.id).eq('status', 'pending'),
    ]);
    return {'today': today, 'att': r[0], 'grades': r[1], 'owed': r[2].fold<num>(0, (s, i) => s + (i['total'] as num) - (i['paid_amount'] as num)), 'behavior': r[3], 'pendingLeave': r[4].length};
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
                  StatTile(label: 'Hari ini', value: today == null ? const Text('Belum absen', style: TextStyle(fontSize: 16)) : StatusPill(today['status'])),
                  StatTile(label: 'Hadir bulan ini', value: Text('${count(['hadir', 'terlambat'])}')),
                  StatTile(label: 'Izin / Sakit / Alpa', value: Text('${count(['izin'])} / ${count(['sakit'])} / ${count(['alpa'])}'), tone: count(['alpa']) > 0 ? Tone.bad : null),
                  StatTile(label: 'Belum lunas', value: FittedBox(child: Text(rupiah(owed))), tone: owed > 0 ? Tone.warn : Tone.good),
                ],
              ),
              if ((d['pendingLeave'] as int) > 0)
                Card(color: Palette.warnSoft, child: Padding(padding: const EdgeInsets.all(12), child: Text('${d['pendingLeave']} pengajuan izin menunggu persetujuan wali kelas.', style: const TextStyle(color: Palette.warn)))),
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
