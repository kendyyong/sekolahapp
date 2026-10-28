import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import '../student/student_checkin.dart' show currentPosition;

const _leaveKind = {'tahunan': 'Cuti tahunan', 'sakit': 'Sakit', 'melahirkan': 'Melahirkan', 'alasan_penting': 'Alasan penting', 'dinas': 'Dinas luar'};

/// Absen masuk/pulang guru (dengan lokasi) dan pengajuan cuti ke kepala sekolah.
class StaffSelf extends StatefulWidget {
  const StaffSelf({super.key});
  @override
  State<StaffSelf> createState() => _StaffSelfState();
}

class _StaffSelfState extends State<StaffSelf> {
  Key _key = UniqueKey();
  bool _busy = false;
  void _refresh() => setState(() => _key = UniqueKey());

  Future<Map<String, dynamic>> _load() async {
    final r = await Future.wait<dynamic>([
      sb.from('staff_attendance').select('date, status, check_in_at, check_out_at').eq('school_id', session.schoolId).eq('user_id', session.userId)
          .order('date', ascending: false).limit(14),
      sb.rpc('staff_leave_balance', params: {'p_school': session.schoolId, 'p_user': session.userId}),
      sb.from('staff_leave_requests').select('id, kind, starts_on, ends_on, reason, status, review_note').eq('school_id', session.schoolId).eq('user_id', session.userId)
          .order('created_at', ascending: false).limit(20),
    ]);
    final recent = r[0] as List;
    return {'today': recent.where((a) => a['date'] == todayJakarta()).firstOrNull, 'recent': recent, 'balance': (r[1] as List).firstOrNull, 'leaves': r[2]};
  }

  Future<void> _checkIn() async {
    setState(() => _busy = true);
    final pos = await currentPosition();
    if (!mounted) return;
    final ok = await act(context, () => sb.rpc('staff_check_in', params: {'p_school': session.schoolId, 'p_lat': pos?.latitude, 'p_lng': pos?.longitude}), ok: 'Absen masuk tercatat.');
    setState(() => _busy = false);
    if (ok) _refresh();
  }

  Future<void> _checkOut() async {
    if (await act(context, () => sb.rpc('staff_check_out', params: {'p_school': session.schoolId}), ok: 'Absen pulang tercatat.')) _refresh();
  }

  @override
  Widget build(BuildContext context) => Loader(
        key: _key,
        load: _load,
        builder: (context, d, reload) {
          final today = d['today'] as Map?;
          final bal = d['balance'] as Map?;
          return PageList(children: [
            Section(
              title: 'Hari ini',
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (today != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(children: [
                      StatusPill(today['status']),
                      const SizedBox(width: 8),
                      Text('Masuk ${waktu(today['check_in_at'])}${today['check_out_at'] != null ? ' · Pulang ${waktu(today['check_out_at'])}' : ''}', style: const TextStyle(color: Palette.muted)),
                    ]),
                  ),
                Row(children: [
                  Expanded(child: FilledButton.icon(onPressed: _busy || today?['check_in_at'] != null ? null : _checkIn, icon: const Icon(Icons.login), label: const Text('Absen masuk'))),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: today?['check_in_at'] == null || today?['check_out_at'] != null ? null : _checkOut,
                      icon: const Icon(Icons.logout),
                      label: const Text('Absen pulang'),
                    ),
                  ),
                ]),
              ]),
            ),
            if (bal != null)
              Row(children: [
                Expanded(child: StatTile(label: 'Kuota cuti', value: Text('${bal['quota']}'))),
                const SizedBox(width: 8),
                Expanded(child: StatTile(label: 'Terpakai', value: Text('${bal['used']}'))),
                const SizedBox(width: 8),
                Expanded(child: StatTile(label: 'Sisa', value: Text('${bal['remaining']}'), tone: Tone.good)),
              ]),
            Section(
              title: 'Pengajuan cuti',
              action: TextButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Ajukan'),
                onPressed: () async {
                  final sent = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const StaffLeaveForm()));
                  if (sent == true) _refresh();
                },
              ),
              child: (d['leaves'] as List).isEmpty
                  ? const EmptyState('Belum ada pengajuan cuti.')
                  : Column(children: [
                      for (final l in d['leaves'] as List)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('${_leaveKind[l['kind']]} · ${tanggal(l['starts_on'])}${l['ends_on'] != l['starts_on'] ? ' – ${tanggal(l['ends_on'])}' : ''}'),
                          subtitle: Text(l['review_note'] ?? l['reason']),
                          trailing: l['status'] == 'pending'
                              ? TextButton(
                                  onPressed: () async {
                                    if (await act(context, () => sb.rpc('cancel_staff_leave', params: {'p_id': l['id']}), ok: 'Pengajuan dibatalkan.')) _refresh();
                                  },
                                  child: const Text('Batalkan'),
                                )
                              : StatusPill(l['status']),
                        ),
                    ]),
            ),
            Section(
              title: 'Riwayat absen',
              child: Column(children: [
                for (final a in d['recent'] as List)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(tanggal(a['date'], withDay: true)),
                    subtitle: a['check_in_at'] == null
                        ? null
                        : Text('Masuk ${waktu(a['check_in_at']).split(', ').last}${a['check_out_at'] != null ? ' · Pulang ${waktu(a['check_out_at']).split(', ').last}' : ''}'),
                    trailing: StatusPill(a['status']),
                  ),
              ]),
            ),
          ]);
        },
      );
}

class StaffLeaveForm extends StatefulWidget {
  const StaffLeaveForm({super.key});
  @override
  State<StaffLeaveForm> createState() => _StaffLeaveFormState();
}

class _StaffLeaveFormState extends State<StaffLeaveForm> {
  String _kind = 'tahunan';
  DateTimeRange? _range;
  String? _substitute;
  final _reason = TextEditingController();
  PickedFile? _file;
  bool _busy = false;
  late final Future<List<Map<String, dynamic>>> _colleagues = sb.from('memberships').select('user_id, profiles(full_name)')
      .eq('school_id', session.schoolId).eq('role', 'teacher').eq('is_active', true).neq('user_id', session.userId);

  String _iso(DateTime d) => d.toIso8601String().substring(0, 10);

  Future<void> _send() async {
    if (_range == null) return toast(context, 'Pilih tanggal cuti.', error: true);
    if (_reason.text.trim().length < 3) return toast(context, 'Tuliskan alasan cuti.', error: true);
    setState(() => _busy = true);
    final ok = await act(context, () async {
      final path = _file == null ? null : await upload('staff-files', '${session.schoolId}/${session.userId}', _file!);
      await sb.from('staff_leave_requests').insert({
        'school_id': session.schoolId, 'user_id': session.userId, 'kind': _kind,
        'starts_on': _iso(_range!.start), 'ends_on': _iso(_range!.end), 'reason': _reason.text.trim(),
        'substitute_id': _substitute, 'attachment_path': path,
      });
    }, ok: 'Pengajuan cuti terkirim ke kepala sekolah.');
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Ajukan cuti')),
        body: PageList(children: [
          DropdownButtonFormField<String>(
            initialValue: _kind,
            decoration: const InputDecoration(labelText: 'Jenis'),
            items: [for (final e in _leaveKind.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _kind = v!),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.date_range),
            label: Text(_range == null ? 'Pilih tanggal' : '${tanggal(_iso(_range!.start))} – ${tanggal(_iso(_range!.end))}'),
            onPressed: () async {
              final now = DateTime.now();
              final r = await showDateRangePicker(context: context, firstDate: now.subtract(const Duration(days: 7)), lastDate: now.add(const Duration(days: 365)), initialDateRange: _range);
              if (r != null) setState(() => _range = r);
            },
          ),
          FutureBuilder(
            future: _colleagues,
            builder: (context, snap) => DropdownButtonFormField<String?>(
              initialValue: _substitute,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Guru pengganti (opsional)'),
              items: [
                const DropdownMenuItem(value: null, child: Text('Tidak ada')),
                for (final c in snap.data ?? const <Map<String, dynamic>>[]) DropdownMenuItem(value: c['user_id'] as String, child: Text(c['profiles']?['full_name'] ?? '')),
              ],
              onChanged: (v) => setState(() => _substitute = v),
            ),
          ),
          TextField(controller: _reason, minLines: 3, maxLines: 6, decoration: const InputDecoration(labelText: 'Alasan', alignLabelWithHint: true)),
          OutlinedButton.icon(
            icon: const Icon(Icons.upload_file),
            label: Text(_file?.name ?? 'Lampiran (surat dokter, undangan dinas; opsional)'),
            onPressed: () async {
              try {
                final f = await pickFile();
                if (f != null) setState(() => _file = f);
              } catch (e) {
                if (context.mounted) toast(context, e.toString(), error: true);
              }
            },
          ),
          FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'Mengirim…' : 'Kirim ke kepala sekolah')),
        ]),
      );
}
