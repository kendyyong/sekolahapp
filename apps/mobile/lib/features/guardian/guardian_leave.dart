import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import 'children.dart';

/// Pengajuan izin/sakit oleh orang tua dengan surat (PDF/foto); ditinjau wali kelas.
class GuardianLeave extends StatelessWidget {
  const GuardianLeave({super.key});

  @override
  Widget build(BuildContext context) => ChildScope(builder: (context, c) => _LeaveList(child: c));
}

class _LeaveList extends StatefulWidget {
  const _LeaveList({required this.child});
  final StudentRef child;
  @override
  State<_LeaveList> createState() => _LeaveListState();
}

class _LeaveListState extends State<_LeaveList> {
  Key _key = UniqueKey();

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.transparent,
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () async {
            final sent = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => LeaveForm(child: widget.child)));
            if (sent == true) setState(() => _key = UniqueKey());
          },
          icon: const Icon(Icons.add),
          label: const Text('Ajukan izin'),
        ),
        body: Loader(
          key: _key,
          load: () => sb.from('student_leave_requests')
              .select('id, kind, starts_on, ends_on, reason, attachment_path, status, review_note, reviewed_at, requested_by')
              .eq('student_id', widget.child.id).order('created_at', ascending: false).limit(50),
          builder: (context, rows, reload) => rows.isEmpty
              ? ListView(children: const [EmptyState('Belum ada pengajuan izin.', icon: Icons.sick_outlined)])
              : PageList(children: [
                  for (final r in rows)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(
                              child: Text('${r['kind'] == 'sakit' ? 'Sakit' : 'Izin'} · ${tanggal(r['starts_on'])}${r['ends_on'] != r['starts_on'] ? ' – ${tanggal(r['ends_on'])}' : ''}',
                                  style: const TextStyle(fontWeight: FontWeight.w700)),
                            ),
                            StatusPill(r['status']),
                          ]),
                          const SizedBox(height: 6),
                          Text(r['reason']),
                          if (r['review_note'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Catatan wali kelas: ${r['review_note']}', style: const TextStyle(color: Palette.muted))),
                          Row(children: [
                            if (r['attachment_path'] != null)
                              TextButton.icon(
                                icon: const Icon(Icons.attach_file),
                                label: const Text('Lihat surat'),
                                onPressed: () async {
                                  final url = await signedUrl('leave-letters', r['attachment_path']);
                                  if (url != null) launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                                },
                              ),
                            const Spacer(),
                            if (r['status'] == 'pending' && r['requested_by'] == session.userId)
                              TextButton(
                                onPressed: () async {
                                  if (await act(context, () => sb.rpc('cancel_student_leave', params: {'p_id': r['id']}), ok: 'Pengajuan dibatalkan.')) reload();
                                },
                                child: const Text('Batalkan'),
                              ),
                          ]),
                        ]),
                      ),
                    ),
                  const SizedBox(height: 64),
                ]),
        ),
      );
}

class LeaveForm extends StatefulWidget {
  const LeaveForm({super.key, required this.child});
  final StudentRef child;
  @override
  State<LeaveForm> createState() => _LeaveFormState();
}

class _LeaveFormState extends State<LeaveForm> {
  String _kind = 'sakit';
  late DateTimeRange _range = () {
    final t = DateTime.parse(todayJakarta());
    return DateTimeRange(start: t, end: t);
  }();
  final _reason = TextEditingController();
  PickedFile? _file;
  bool _busy = false;

  String _iso(DateTime d) => d.toIso8601String().substring(0, 10);

  Future<void> _send() async {
    if (_reason.text.trim().length < 3) return toast(context, 'Tuliskan alasan izin.', error: true);
    setState(() => _busy = true);
    final ok = await act(context, () async {
      final path = _file == null ? null : await upload('leave-letters', '${session.schoolId}/${widget.child.id}', _file!);
      await sb.from('student_leave_requests').insert({
        'school_id': session.schoolId, 'student_id': widget.child.id, 'kind': _kind,
        'starts_on': _iso(_range.start), 'ends_on': _iso(_range.end), 'reason': _reason.text.trim(), 'attachment_path': path,
      });
    }, ok: 'Pengajuan terkirim ke wali kelas.');
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Izin untuk ${widget.child.fullName.split(' ').first}')),
        body: PageList(children: [
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'sakit', label: Text('Sakit'), icon: Icon(Icons.sick_outlined)), ButtonSegment(value: 'izin', label: Text('Izin'), icon: Icon(Icons.event_busy))],
            selected: {_kind},
            onSelectionChanged: (s) => setState(() => _kind = s.first),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.date_range),
            label: Text(_range.start == _range.end ? tanggal(_iso(_range.start), withDay: true) : '${tanggal(_iso(_range.start))} – ${tanggal(_iso(_range.end))}'),
            onPressed: () async {
              final now = DateTime.now();
              final r = await showDateRangePicker(
                context: context,
                firstDate: now.subtract(const Duration(days: 14)),
                lastDate: now.add(const Duration(days: 60)),
                initialDateRange: _range,
              );
              if (r != null) setState(() => _range = r);
            },
          ),
          TextField(controller: _reason, minLines: 3, maxLines: 6, maxLength: 2000, decoration: const InputDecoration(labelText: 'Alasan', hintText: 'Contoh: demam sejak semalam, istirahat di rumah.', alignLabelWithHint: true)),
          OutlinedButton.icon(
            icon: const Icon(Icons.upload_file),
            label: Text(_file?.name ?? 'Lampirkan surat dokter / surat izin (PDF/foto, maks. 5 MB)'),
            onPressed: () async {
              try {
                final f = await pickFile();
                if (f != null) setState(() => _file = f);
              } catch (e) {
                if (context.mounted) toast(context, e.toString(), error: true);
              }
            },
          ),
          FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'Mengirim…' : 'Kirim pengajuan')),
        ]),
      );
}
