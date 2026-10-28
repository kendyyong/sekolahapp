import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import 'teacher_home.dart';

/// Wali kelas meninjau izin/sakit yang diajukan orang tua atau murid.
class TeacherLeaveReview extends StatefulWidget {
  const TeacherLeaveReview({super.key});
  @override
  State<TeacherLeaveReview> createState() => _TeacherLeaveReviewState();
}

class _TeacherLeaveReviewState extends State<TeacherLeaveReview> {
  String _status = 'pending';
  Key _key = UniqueKey();

  Future<List<Map<String, dynamic>>?> _load() async {
    final ids = await homeroomStudentIds();
    if (ids.isEmpty) return null;
    return sb.from('student_leave_requests')
        .select('id, kind, starts_on, ends_on, reason, attachment_path, status, created_at, review_note, students(full_name), profiles:requested_by(full_name)')
        .inFilter('student_id', ids).eq('status', _status).order('created_at', ascending: false).limit(100);
  }

  Future<void> _review(Map r, bool approve) async {
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(approve ? 'Setujui izin?' : 'Tolak izin?'),
        content: TextField(controller: note, decoration: const InputDecoration(labelText: 'Catatan untuk orang tua (opsional)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(approve ? 'Setujui' : 'Tolak')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    if (await act(context, () => sb.rpc('review_student_leave', params: {'p_id': r['id'], 'p_approve': approve, 'p_note': note.text.trim().isEmpty ? null : note.text.trim()}),
        ok: approve ? 'Izin disetujui. Absensi diperbarui otomatis.' : 'Izin ditolak.')) {
      setState(() => _key = UniqueKey());
    }
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'pending', label: Text('Menunggu')),
              ButtonSegment(value: 'approved', label: Text('Disetujui')),
              ButtonSegment(value: 'rejected', label: Text('Ditolak')),
            ],
            selected: {_status},
            showSelectedIcon: false,
            onSelectionChanged: (s) => setState(() {
              _status = s.first;
              _key = UniqueKey();
            }),
          ),
        ),
        Expanded(
          child: Loader(
            key: _key,
            load: _load,
            builder: (context, rows, _) {
              if (rows == null) return ListView(children: const [EmptyState('Anda belum menjadi wali kelas.')]);
              if (rows.isEmpty) return ListView(children: const [EmptyState('Tidak ada pengajuan pada status ini.')]);
              return PageList(children: [
                for (final r in rows)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(r['students']?['full_name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700))),
                          Pill(r['kind'] == 'sakit' ? 'Sakit' : 'Izin', tone: Tone.info),
                        ]),
                        Text('${tanggal(r['starts_on'])}${r['ends_on'] != r['starts_on'] ? ' – ${tanggal(r['ends_on'])}' : ''} · oleh ${r['profiles']?['full_name'] ?? ''}',
                            style: const TextStyle(fontSize: 12, color: Palette.muted)),
                        const SizedBox(height: 6),
                        Text(r['reason']),
                        if (r['review_note'] != null) Text('Catatan: ${r['review_note']}', style: const TextStyle(color: Palette.muted)),
                        Row(children: [
                          if (r['attachment_path'] != null)
                            TextButton.icon(
                              icon: const Icon(Icons.attach_file),
                              label: const Text('Surat'),
                              onPressed: () async {
                                final url = await signedUrl('leave-letters', r['attachment_path']);
                                if (url != null) launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                              },
                            ),
                          const Spacer(),
                          if (r['status'] == 'pending') ...[
                            TextButton(onPressed: () => _review(r, false), child: const Text('Tolak')),
                            FilledButton(onPressed: () => _review(r, true), child: const Text('Setujui')),
                          ],
                        ]),
                      ]),
                    ),
                  ),
              ]);
            },
          ),
        ),
      ]);
}
