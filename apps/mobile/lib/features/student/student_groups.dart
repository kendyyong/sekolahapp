import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

const _position = {'ketua': 'Ketua', 'sekretaris': 'Sekretaris', 'bendahara': 'Bendahara', 'anggota': 'Anggota'};

/// Kelompok kerja murid: Ketua, Sekretaris, Bendahara, Anggota; diverifikasi guru.
class StudentGroups extends StatefulWidget {
  const StudentGroups({super.key});
  @override
  State<StudentGroups> createState() => _StudentGroupsState();
}

class _StudentGroupsState extends State<StudentGroups> {
  Key _key = UniqueKey();
  void _refresh() => setState(() => _key = UniqueKey());

  Future<Map<String, dynamic>?> _load() async {
    final me = await myStudent(session.userId, session.schoolId);
    if (me?.klass == null) return null;
    final mem = await sb.from('work_group_members').select('group_id, position, invite_status').eq('student_id', me!.id);
    final ids = mem.where((m) => m['invite_status'] != 'declined').map((m) => m['group_id']).toList();
    final groups = ids.isEmpty
        ? <Map<String, dynamic>>[]
        : await sb.from('work_groups')
            .select('id, name, status, review_note, teaching_assignments(subjects(name)), assignments(title), work_group_members(student_id, position, invite_status, students(full_name))')
            .inFilter('id', ids).order('created_at', ascending: false);
    return {'me': me, 'groups': groups, 'mine': {for (final m in mem) m['group_id']: m}};
  }

  Future<void> _create(StudentRef me) async {
    final tas = await sb.from('teaching_assignments').select('id, subjects(name)').eq('class_id', me.klass!.id);
    if (!mounted) return;
    final name = TextEditingController();
    String? ta;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Kelompok baru'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Nama kelompok')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: ta,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Mata pelajaran (opsional)'),
              items: [
                const DropdownMenuItem(value: null, child: Text('Umum')),
                for (final t in tas) DropdownMenuItem(value: t['id'] as String, child: Text(t['subjects']?['name'] ?? '')),
              ],
              onChanged: (v) => set(() => ta = v),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Buat')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    if (await act(context, () => sb.rpc('create_work_group', params: {'p_class': me.klass!.id, 'p_name': name.text.trim(), 'p_ta': ta, 'p_assignment': null}),
        ok: 'Kelompok dibuat. Anda menjadi Ketua; undang teman sekelas.')) {
      _refresh();
    }
  }

  @override
  Widget build(BuildContext context) => Loader(
        key: _key,
        load: _load,
        builder: (context, d, _) {
          if (d == null) return ListView(children: const [EmptyState('Anda belum terdaftar di kelas.')]);
          final groups = d['groups'] as List;
          final mine = d['mine'] as Map;
          return PageList(children: [
            FilledButton.icon(onPressed: () => _create(d['me']), icon: const Icon(Icons.group_add_outlined), label: const Text('Buat kelompok')),
            if (groups.isEmpty) const EmptyState('Belum ada kelompok.', icon: Icons.groups_outlined),
            for (final g in groups)
              Card(
                child: ListTile(
                  title: Text(g['name'], style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text([
                    g['teaching_assignments']?['subjects']?['name'] ?? 'Umum',
                    '${(g['work_group_members'] as List).where((m) => m['invite_status'] == 'accepted').length} anggota',
                    if (mine[g['id']]?['invite_status'] == 'invited') 'Anda diundang sebagai ${_position[mine[g['id']]['position']]}',
                  ].join(' · ')),
                  trailing: StatusPill(mine[g['id']]?['invite_status'] == 'invited' ? 'invited' : g['status']),
                  onTap: () async {
                    await Navigator.push(context, MaterialPageRoute(builder: (_) => GroupDetail(groupId: g['id'], me: d['me'])));
                    _refresh();
                  },
                ),
              ),
          ]);
        },
      );
}

class GroupDetail extends StatefulWidget {
  const GroupDetail({super.key, required this.groupId, required this.me});
  final String groupId;
  final StudentRef me;
  @override
  State<GroupDetail> createState() => _GroupDetailState();
}

class _GroupDetailState extends State<GroupDetail> {
  Key _key = UniqueKey();
  void _refresh() => setState(() => _key = UniqueKey());

  Future<Map<String, dynamic>> _load() async {
    final g = await sb.from('work_groups')
        .select('id, name, status, review_note, class_id, teaching_assignments(subjects(name)), assignments(title), work_group_members(student_id, position, invite_status, students(full_name))')
        .eq('id', widget.groupId).single();
    final ledger = g['status'] == 'verified'
        ? await sb.from('group_ledger').select('id, direction, amount, description, occurred_on').eq('group_id', widget.groupId).order('occurred_on')
        : <Map<String, dynamic>>[];
    return {'g': g, 'ledger': ledger};
  }

  Future<void> _rpc(String fn, Map<String, dynamic> params, String ok) async {
    if (await act(context, () => sb.rpc(fn, params: {'p_group': widget.groupId, ...params}), ok: ok)) _refresh();
  }

  Future<void> _invite(Map g) async {
    final roster = await classRoster(g['class_id']);
    final inGroup = (g['work_group_members'] as List).map((m) => m['student_id']).toSet();
    final candidates = roster.where((s) => !inGroup.contains(s['id'])).toList();
    if (!mounted) return;
    String? student;
    String position = 'anggota';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Undang teman'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: student,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Teman sekelas'),
              items: [for (final s in candidates) DropdownMenuItem(value: s['id'] as String, child: Text(s['full_name']))],
              onChanged: (v) => set(() => student = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: position,
              decoration: const InputDecoration(labelText: 'Jabatan'),
              items: [for (final p in ['sekretaris', 'bendahara', 'anggota']) DropdownMenuItem(value: p, child: Text(_position[p]!))],
              onChanged: (v) => set(() => position = v!),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Undang')),
          ],
        ),
      ),
    );
    if (ok == true && student != null) await _rpc('invite_group_member', {'p_student': student, 'p_position': position}, 'Undangan terkirim.');
  }

  Future<void> _addLedger() async {
    final amount = TextEditingController();
    final desc = TextEditingController();
    String direction = 'masuk';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Catat kas kelompok'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'masuk', label: Text('Masuk')), ButtonSegment(value: 'keluar', label: Text('Keluar'))],
              selected: {direction},
              onSelectionChanged: (s) => set(() => direction = s.first),
            ),
            const SizedBox(height: 12),
            TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah (Rp)')),
            const SizedBox(height: 12),
            TextField(controller: desc, decoration: const InputDecoration(labelText: 'Keterangan')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Simpan')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final value = int.tryParse(amount.text.replaceAll(RegExp(r'[^0-9]'), ''));
    if (value == null || value <= 0) return toast(context, 'Jumlah tidak valid', error: true);
    if (await act(context, () => sb.from('group_ledger').insert({
          'group_id': widget.groupId, 'school_id': session.schoolId, 'direction': direction, 'amount': value,
          'description': desc.text.trim(), 'occurred_on': todayJakarta(), 'recorded_by': session.userId,
        }), ok: 'Kas kelompok dicatat.')) {
      _refresh();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Kelompok')),
        body: Loader(
          key: _key,
          load: _load,
          builder: (context, d, _) {
            final g = d['g'] as Map;
            final members = (g['work_group_members'] as List).toList()
              ..sort((a, b) => ['ketua', 'sekretaris', 'bendahara', 'anggota'].indexOf(a['position']).compareTo(['ketua', 'sekretaris', 'bendahara', 'anggota'].indexOf(b['position'])));
            final me = members.where((m) => m['student_id'] == widget.me.id).firstOrNull;
            final leader = me?['position'] == 'ketua' && me?['invite_status'] == 'accepted';
            final editable = leader && ['draft', 'revision'].contains(g['status']);
            final treasurer = me?['position'] == 'bendahara' && me?['invite_status'] == 'accepted' && g['status'] == 'verified';
            final ledger = d['ledger'] as List;
            final balance = ledger.fold<num>(0, (s, l) => s + (l['direction'] == 'masuk' ? 1 : -1) * (l['amount'] as num));
            return PageList(children: [
              Row(children: [
                Expanded(child: Text(g['name'], style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800))),
                StatusPill(g['status']),
              ]),
              Text([g['teaching_assignments']?['subjects']?['name'] ?? 'Umum', if (g['assignments'] != null) g['assignments']['title']].join(' · '), style: const TextStyle(color: Palette.muted)),
              if (g['review_note'] != null) Card(color: Palette.warnSoft, child: Padding(padding: const EdgeInsets.all(12), child: Text('Catatan guru: ${g['review_note']}', style: const TextStyle(color: Palette.warn)))),
              if (me?['invite_status'] == 'invited')
                Section(
                  title: 'Anda diundang sebagai ${_position[me!['position']]}',
                  child: Row(children: [
                    Expanded(child: FilledButton(onPressed: () => _rpc('respond_group_invite', {'p_accept': true}, 'Anda bergabung ke kelompok.'), child: const Text('Terima'))),
                    const SizedBox(width: 8),
                    Expanded(child: OutlinedButton(onPressed: () => _rpc('respond_group_invite', {'p_accept': false}, 'Undangan ditolak.'), child: const Text('Tolak'))),
                  ]),
                ),
              Section(
                title: 'Anggota',
                action: editable ? TextButton.icon(onPressed: () => _invite(g), icon: const Icon(Icons.person_add_alt), label: const Text('Undang')) : null,
                child: Column(children: [
                  for (final m in members)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(m['students']?['full_name'] ?? ''),
                      subtitle: Text(_position[m['position']] ?? m['position']),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        StatusPill(m['invite_status']),
                        if (editable && m['position'] != 'ketua')
                          IconButton(
                            tooltip: 'Keluarkan',
                            icon: const Icon(Icons.close, size: 18),
                            onPressed: () => _rpc('remove_group_member', {'p_student': m['student_id']}, 'Anggota dikeluarkan.'),
                          ),
                      ]),
                    ),
                ]),
              ),
              if (editable)
                FilledButton.icon(
                  onPressed: () => _rpc('submit_work_group', {}, 'Kelompok dikirim ke guru untuk diverifikasi.'),
                  icon: const Icon(Icons.send),
                  label: const Text('Kirim ke guru untuk verifikasi'),
                ),
              if (g['status'] == 'verified')
                Section(
                  title: 'Kas kelompok · ${rupiah(balance)}',
                  action: treasurer ? TextButton.icon(onPressed: _addLedger, icon: const Icon(Icons.add), label: const Text('Catat')) : null,
                  child: ledger.isEmpty
                      ? const EmptyState('Belum ada catatan kas.')
                      : Column(children: [
                          for (final l in ledger)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              title: Text(l['description']),
                              subtitle: Text(tanggal(l['occurred_on'])),
                              trailing: Text('${l['direction'] == 'masuk' ? '+' : '−'}${rupiah(l['amount'])}',
                                  style: TextStyle(fontWeight: FontWeight.w700, color: l['direction'] == 'masuk' ? Palette.good : Palette.bad)),
                            ),
                        ]),
                ),
            ]);
          },
        ),
      );
}
