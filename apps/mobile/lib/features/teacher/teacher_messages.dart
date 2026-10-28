import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import '../shared/chat_view.dart';

/// Daftar murid perwalian; buka percakapan dengan orang tuanya.
class TeacherMessages extends StatelessWidget {
  const TeacherMessages({super.key});

  Future<List<Map<String, dynamic>>> _load() async {
    final classes = await sb.from('classes').select('id, name, enrollments(students(id, full_name)), academic_years!inner(is_active)')
        .eq('homeroom_teacher_id', session.userId).eq('school_id', session.schoolId).eq('academic_years.is_active', true);
    final students = [
      for (final c in classes)
        for (final e in (c['enrollments'] as List)) {'id': e['students']['id'], 'full_name': e['students']['full_name'], 'kelas': c['name']},
    ];
    if (students.isEmpty) return students;
    final last = await sb.from('student_messages').select('student_id, created_at').inFilter('student_id', students.map((s) => s['id']).toList())
        .order('created_at', ascending: false).limit(500);
    final lastAt = <String, String>{};
    for (final m in last) {
      lastAt.putIfAbsent(m['student_id'], () => m['created_at']);
    }
    for (final s in students) {
      s['last'] = lastAt[s['id']];
    }
    int byRecent(Map a, Map b) {
      final c = ((b['last'] ?? '') as String).compareTo((a['last'] ?? '') as String);
      return c != 0 ? c : (a['full_name'] as String).compareTo(b['full_name'] as String);
    }

    return students..sort(byRecent);
  }

  @override
  Widget build(BuildContext context) => Loader(
        load: _load,
        builder: (context, students, _) => students.isEmpty
            ? ListView(children: const [EmptyState('Anda belum menjadi wali kelas.')])
            : ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                itemCount: students.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final s = students[i];
                  return ListTile(
                    title: Text(s['full_name']),
                    subtitle: Text(s['kelas']),
                    trailing: s['last'] != null ? const Icon(Icons.circle, size: 10, color: Palette.accent) : null,
                    onTap: () => Navigator.push(context, MaterialPageRoute(
                      builder: (_) => Scaffold(appBar: AppBar(title: Text('Tentang ${s['full_name']}')), body: ChatView(studentId: s['id'])),
                    )),
                  );
                },
              ),
      );
}
