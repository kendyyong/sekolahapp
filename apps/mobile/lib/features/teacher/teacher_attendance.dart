import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

const _statuses = ['hadir', 'terlambat', 'izin', 'sakit', 'alpa'];
const _method = {'qr': 'absen sendiri', 'geo': 'absen sendiri + lokasi', 'leave': 'surat izin'};

/// Absensi harian kelas: tandai status per murid, tampilkan QR kelas, tutup absensi.
class TeacherAttendance extends StatefulWidget {
  const TeacherAttendance({super.key});
  @override
  State<TeacherAttendance> createState() => _TeacherAttendanceState();
}

class _TeacherAttendanceState extends State<TeacherAttendance> {
  String? _classId;
  final _date = todayJakarta();
  final Map<String, String> _changes = {};
  Key _key = UniqueKey();

  Future<Map<String, dynamic>> _load() async {
    final classes = await myClasses(session.userId, session.schoolId);
    _classId ??= (classes.where((c) => c.homeroom).firstOrNull ?? classes.firstOrNull)?.id;
    if (_classId == null) return {'classes': classes};
    final r = await Future.wait<dynamic>([
      classRoster(_classId!),
      sb.from('student_attendance').select('student_id, status, method').eq('class_id', _classId!).eq('date', _date).isFilter('teaching_assignment_id', null),
      sb.from('classes').select('qr_secret, name').eq('id', _classId!).single(),
    ]);
    return {'classes': classes, 'roster': r[0], 'att': {for (final a in r[1] as List) a['student_id']: a}, 'class': r[2]};
  }

  void _reload() => setState(() {
        _changes.clear();
        _key = UniqueKey();
      });

  Future<void> _save() async {
    final rows = [
      for (final e in _changes.entries)
        {'school_id': session.schoolId, 'class_id': _classId, 'student_id': e.key, 'date': _date, 'status': e.value, 'method': 'manual'},
    ];
    if (await act(context, () => sb.from('student_attendance').upsert(rows, onConflict: 'student_id,date,teaching_assignment_id'), ok: 'Absensi ${rows.length} murid disimpan.')) _reload();
  }

  Future<void> _close() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tutup absensi hari ini?'),
        content: const Text('Murid yang belum tercatat ditandai alpa dan orang tuanya diberi tahu.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Tutup absensi')),
        ],
      ),
    );
    if (yes == true && mounted && await act(context, () => sb.rpc('close_daily_attendance', params: {'p_class': _classId, 'p_date': _date}), ok: 'Absensi ditutup.')) _reload();
  }

  void _showQr(Map klass) => showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Absen kelas ${klass['name']}'),
          content: SizedBox(
            width: 260,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              QrImageView(data: klass['qr_secret'], size: 240, backgroundColor: Colors.white),
              const SizedBox(height: 8),
              SelectableText(klass['qr_secret'], style: const TextStyle(fontSize: 22, fontFamily: 'monospace', letterSpacing: 3, fontWeight: FontWeight.w700)),
              const Text('Murid memindai QR ini atau mengetik kodenya di menu Absen.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Palette.muted)),
            ]),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Tutup'))],
        ),
      );

  @override
  Widget build(BuildContext context) => Loader(
        key: _key,
        load: _load,
        builder: (context, d, _) {
          final classes = d['classes'] as List<ClassRef>;
          if (_classId == null) return ListView(children: const [EmptyState('Anda belum mengajar kelas mana pun.')]);
          final roster = d['roster'] as List;
          final att = d['att'] as Map;
          return Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _classId,
                    decoration: const InputDecoration(labelText: 'Kelas'),
                    items: [for (final c in classes) DropdownMenuItem(value: c.id, child: Text('${c.name}${c.homeroom ? ' (wali)' : ''}'))],
                    onChanged: (v) {
                      _classId = v;
                      _reload();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(tooltip: 'Tampilkan QR absen', onPressed: () => _showQr(d['class']), icon: const Icon(Icons.qr_code_2)),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(children: [
                Text(tanggal(_date, withDay: true), style: const TextStyle(color: Palette.muted)),
                const Spacer(),
                Text('${att.length}/${roster.length} tercatat', style: const TextStyle(color: Palette.muted)),
              ]),
            ),
            Expanded(
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                itemCount: roster.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final s = roster[i];
                  final current = _changes[s['id']] ?? att[s['id']]?['status'] as String?;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text('${s['roll'] ?? '–'}. ${s['full_name']}', style: const TextStyle(fontWeight: FontWeight.w600))),
                        if (att[s['id']] != null && att[s['id']]['method'] != 'manual')
                          Text(_method[att[s['id']]['method']] ?? '', style: const TextStyle(fontSize: 12, color: Palette.muted)),
                      ]),
                      const SizedBox(height: 6),
                      Wrap(spacing: 6, children: [
                        for (final st in _statuses)
                          ChoiceChip(
                            label: Text(statusLabel[st]!),
                            visualDensity: VisualDensity.compact,
                            selected: current == st,
                            selectedColor: toneColors(statusTone[st]!).$2,
                            onSelected: (_) => setState(() => _changes[s['id']] = st),
                          ),
                      ]),
                    ]),
                  );
                },
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Row(children: [
                  Expanded(child: OutlinedButton(onPressed: _close, child: const Text('Tutup hari ini'))),
                  const SizedBox(width: 8),
                  Expanded(child: FilledButton(onPressed: _changes.isEmpty ? null : _save, child: Text('Simpan (${_changes.length})'))),
                ]),
              ),
            ),
          ]);
        },
      );
}
