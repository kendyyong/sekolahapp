import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

class StudentTasks extends StatefulWidget {
  const StudentTasks({super.key});
  @override
  State<StudentTasks> createState() => _StudentTasksState();
}

class _StudentTasksState extends State<StudentTasks> {
  Key _key = UniqueKey();

  Future<Map<String, dynamic>?> _load() async {
    final me = await myStudent(session.userId, session.schoolId);
    if (me?.klass == null) return null;
    final tas = await sb.from('teaching_assignments').select('id, subjects(name)').eq('class_id', me!.klass!.id);
    final subjectOf = {for (final t in tas) t['id'] as String: t['subjects']?['name'] as String? ?? ''};
    final r = await Future.wait([
      sb.from('assignments').select('id, kind, title, description, due_at, is_group, max_score, meeting_url, attachments, teaching_assignment_id')
          .inFilter('teaching_assignment_id', subjectOf.keys.toList()).order('due_at', ascending: false, nullsFirst: false).limit(100),
      sb.from('submissions').select('assignment_id, body, link_url, attachments, submitted_at, is_late, score, feedback').eq('student_id', me.id),
    ]);
    return {'me': me, 'subjectOf': subjectOf, 'assignments': r[0], 'subs': {for (final s in r[1]) s['assignment_id']: s}};
  }

  @override
  Widget build(BuildContext context) => Loader(
        key: _key,
        load: _load,
        builder: (context, d, _) {
          if (d == null) return ListView(children: const [EmptyState('Anda belum terdaftar di kelas.')]);
          final list = d['assignments'] as List;
          final subs = d['subs'] as Map;
          if (list.isEmpty) return ListView(children: const [EmptyState('Belum ada tugas.', icon: Icons.assignment_outlined)]);
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: list.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (_, i) {
              final a = list[i];
              final s = subs[a['id']];
              final late = s == null && a['due_at'] != null && DateTime.parse(a['due_at']).isBefore(DateTime.now());
              return ListTile(
                title: Text(a['title']),
                subtitle: Text('${(d['subjectOf'] as Map)[a['teaching_assignment_id']]}${a['is_group'] == true ? ' · Kelompok' : ''} · Tenggat ${waktu(a['due_at'])}'),
                trailing: s != null
                    ? (s['score'] != null ? Pill('Nilai ${s['score']}', tone: Tone.good) : const Pill('Terkirim', tone: Tone.info))
                    : late
                        ? const Pill('Lewat tenggat', tone: Tone.bad)
                        : const Pill('Belum', tone: Tone.warn),
                onTap: () async {
                  final changed = await Navigator.push<bool>(context, MaterialPageRoute(
                    builder: (_) => TaskDetail(assignment: a, subject: (d['subjectOf'] as Map)[a['teaching_assignment_id']], submission: s, me: d['me']),
                  ));
                  if (changed == true) setState(() => _key = UniqueKey());
                },
              );
            },
          );
        },
      );
}

class TaskDetail extends StatefulWidget {
  const TaskDetail({super.key, required this.assignment, required this.subject, required this.submission, required this.me});
  final Map assignment;
  final String subject;
  final Map? submission;
  final StudentRef me;
  @override
  State<TaskDetail> createState() => _TaskDetailState();
}

class _TaskDetailState extends State<TaskDetail> {
  late final _body = TextEditingController(text: widget.submission?['body']);
  late final _link = TextEditingController(text: widget.submission?['link_url']);
  PickedFile? _file;
  bool _busy = false;

  Future<void> _openAttachment(Map f) async {
    final url = await signedUrl('assignments', f['path']);
    if (url != null) launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final a = widget.assignment;
    final ok = await act(context, () async {
      var attachments = <Map<String, String>>[];
      if (_file != null) {
        final path = await upload('submissions', '${session.schoolId}/${a['id']}/${widget.me.id}', _file!);
        attachments = [{'path': path, 'name': _file!.name}];
      }
      await sb.rpc('submit_assignment', params: {
        'p_assignment': a['id'],
        'p_body': _body.text.trim().isEmpty ? null : _body.text.trim(),
        'p_link': _link.text.trim().isEmpty ? null : _link.text.trim(),
        'p_attachments': attachments,
      });
    }, ok: 'Jawaban terkirim.');
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.assignment;
    final s = widget.submission;
    return Scaffold(
      appBar: AppBar(title: Text(a['title'])),
      body: PageList(children: [
        Text('${widget.subject} · Tenggat ${waktu(a['due_at'])} · Nilai maks. ${a['max_score']}', style: const TextStyle(color: Palette.muted)),
        if (a['description'] != null) Text(a['description']),
        for (final f in (a['attachments'] as List? ?? []))
          OutlinedButton.icon(onPressed: () => _openAttachment(f), icon: const Icon(Icons.attach_file), label: Text(f['name'] ?? 'Lampiran')),
        if (a['meeting_url'] != null)
          FilledButton.tonalIcon(onPressed: () => launchUrl(Uri.parse(a['meeting_url']), mode: LaunchMode.externalApplication), icon: const Icon(Icons.videocam_outlined), label: const Text('Buka kelas online')),
        if (s?['score'] != null)
          Card(
            color: Palette.goodSoft,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Nilai ${s!['score']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Palette.good)),
                if (s['feedback'] != null) Text(s['feedback'], style: const TextStyle(color: Palette.good)),
              ]),
            ),
          )
        else
          Section(
            title: s == null ? 'Kirim jawaban' : 'Kirim ulang jawaban',
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (a['is_group'] == true)
                const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('Tugas kelompok: jawaban berlaku untuk semua anggota kelompok terverifikasi Anda.', style: TextStyle(fontSize: 12, color: Palette.muted))),
              if (s != null)
                Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Terkirim ${waktu(s['submitted_at'])}${s['is_late'] == true ? ' (terlambat)' : ''}', style: const TextStyle(fontSize: 12, color: Palette.muted))),
              TextField(controller: _body, minLines: 4, maxLines: 10, decoration: const InputDecoration(labelText: 'Jawaban', alignLabelWithHint: true)),
              const SizedBox(height: 12),
              TextField(controller: _link, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Link (Google Drive, YouTube, dll.)')),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.upload_file),
                label: Text(_file?.name ?? 'Lampirkan foto/PDF (maks. 20 MB)'),
                onPressed: () async {
                  try {
                    final f = await pickFile(extensions: const ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'ppt', 'pptx'], maxMb: 20);
                    if (f != null) setState(() => _file = f);
                  } catch (e) {
                    if (context.mounted) toast(context, e.toString(), error: true);
                  }
                },
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Mengirim…' : 'Kirim')),
            ]),
          ),
      ]),
    );
  }
}
