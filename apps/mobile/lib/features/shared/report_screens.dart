import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

const _promotion = {'naik': 'Naik kelas', 'tinggal': 'Tinggal kelas', 'lulus': 'Lulus', 'tidak_lulus': 'Tidak lulus'};
const _frameworkTitle = {'kokurikuler': 'Kokurikuler', 'p5': 'Projek Penguatan Profil Pelajar Pancasila'};
const _levelPhrase = {'SB': 'sangat berkembang', 'BSH': 'berkembang sesuai harapan', 'MB': 'mulai berkembang', 'BB': 'belum berkembang'};

/// Deskripsi capaian projek, sama dengan versi web (lib/kokurikuler.ts projectNarrative).
String projectNarrative(String name, List aspects) {
  String lowerFirst(String s) => s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);
  String join(List<String> xs) => xs.length <= 1 ? xs.join() : '${xs.sublist(0, xs.length - 1).join(', ')} dan ${xs.last}';
  final parts = [
    for (final lv in _levelPhrase.keys)
      if (aspects.any((a) => a['level'] == lv))
        '${_levelPhrase[lv]} dalam ${join([for (final a in aspects) if (a['level'] == lv) lowerFirst((a['element'] ?? a['dimension']) as String)])}',
  ];
  return parts.isEmpty ? '' : 'Ananda $name ${parts.join('; ')}.';
}

/// Daftar rapor yang sudah diterbitkan sekolah untuk satu murid (RLS hanya mengembalikan rapor final & terbit).
class ReportsSection extends StatelessWidget {
  const ReportsSection({super.key, required this.studentId, required this.studentName});
  final String studentId;
  final String studentName;

  @override
  Widget build(BuildContext context) {
    if (!session.modules.contains('grades')) return const SizedBox.shrink();
    return Section(
      title: 'Rapor',
      child: FutureBuilder(
        future: sb.from('report_cards').select('term_id, terms(name, semester, published_at, academic_years(name))').eq('student_id', studentId),
        builder: (context, snap) {
          if (!snap.hasData) return const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator());
          final rows = [...snap.data!]..sort((a, b) => '${b['terms']?['published_at']}'.compareTo('${a['terms']?['published_at']}'));
          if (rows.isEmpty) return const EmptyState('Belum ada rapor yang diterbitkan sekolah.', icon: Icons.menu_book_outlined);
          return Column(children: [
            for (final r in rows)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.menu_book_outlined, color: Theme.of(context).colorScheme.primary),
                title: Text('Semester ${r['terms']['semester']} (${r['terms']['name']}) · ${r['terms']['academic_years']?['name'] ?? ''}'),
                subtitle: Text('Terbit ${tanggal((r['terms']['published_at'] as String?)?.substring(0, 10))}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(context, MaterialPageRoute(
                  builder: (_) => ReportDetailScreen(termId: r['term_id'], studentId: studentId, title: studentName))),
              ),
          ]);
        },
      ),
    );
  }
}

class ReportDetailScreen extends StatelessWidget {
  const ReportDetailScreen({super.key, required this.termId, required this.studentId, required this.title});
  final String termId;
  final String studentId;
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Rapor $title')),
        body: Loader(
          load: () async {
            final params = {'p_term': termId, 'p_student': studentId};
            final [view, projects] = await Future.wait([sb.rpc('report_card_view', params: params), sb.rpc('kokurikuler_report', params: params)]);
            return {...Map<String, dynamic>.from(view), 'projects': projects ?? const []};
          },
          builder: (context, r, _) {
            final card = r['card'] as Map;
            final kktp = (r['kktp'] as num?) ?? 75;
            final extras = (card['extracurriculars'] as List?) ?? const [];
            final projects = r['projects'] as List;
            final firstName = (r['student']['full_name'] as String).split(' ').first;
            String narrative(Map p) {
              final t = projectNarrative(firstName, (p['aspects'] as List?) ?? const []);
              return t.isEmpty ? 'Belum dinilai.' : t;
            }
            return PageList(children: [
              Text(r['school']['name'], style: const TextStyle(color: Palette.muted)),
              Text('Kelas ${r['class']['name']} · Semester ${r['term']['semester']} (${r['term']['name']}) · ${r['term']['year']}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              Section(
                title: 'Nilai & capaian',
                child: Column(children: [
                  for (final g in r['grades'] as List)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(g['subject'], style: const TextStyle(fontWeight: FontWeight.w700)),
                            if (g['description'] != null) Text(g['description'], style: const TextStyle(color: Palette.muted)),
                          ]),
                        ),
                        const SizedBox(width: 12),
                        Text(g['score'] == null ? '–' : '${(g['score'] as num).round()}',
                            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: g['score'] != null && (g['score'] as num) < kktp ? Palette.bad : null)),
                      ]),
                    ),
                ]),
              ),
              for (final fw in _frameworkTitle.keys)
                if (projects.any((p) => p['framework'] == fw))
                  Section(
                    title: _frameworkTitle[fw]!,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      for (final p in projects.where((p) => p['framework'] == fw))
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(p['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
                            if (p['theme'] != null) Text('Tema: ${p['theme']}', style: const TextStyle(fontSize: 12, color: Palette.muted)),
                            const SizedBox(height: 4),
                            Text(narrative(p)),
                            if (p['note'] != null) Text(p['note'], style: const TextStyle(color: Palette.muted)),
                          ]),
                        ),
                    ]),
                  ),
              Section(
                title: 'Ketidakhadiran',
                child: Row(children: [
                  for (final (k, v) in [('Sakit', card['sick']), ('Izin', card['permit']), ('Tanpa keterangan', card['absent'])])
                    Expanded(child: Column(children: [Text('$v', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)), Text(k, style: const TextStyle(fontSize: 12, color: Palette.muted))])),
                ]),
              ),
              if (extras.isNotEmpty)
                Section(
                  title: 'Ekstrakurikuler',
                  child: Column(children: [
                    for (final e in extras)
                      ListTile(contentPadding: EdgeInsets.zero, title: Text(e['name'] ?? ''), subtitle: (e['note'] ?? '').isEmpty ? null : Text(e['note']),
                          trailing: (e['grade'] ?? '').isEmpty ? null : Pill(e['grade'])),
                  ]),
                ),
              if (card['homeroom_note'] != null)
                Section(title: 'Catatan wali kelas', child: Text(card['homeroom_note'])),
              if (card['promotion'] != null)
                Section(title: 'Keputusan', child: Text(_promotion[card['promotion']] ?? card['promotion'])),
              Text('Wali kelas: ${r['homeroom'] ?? '–'} · Kepala sekolah: ${r['principal'] ?? '–'}', style: const TextStyle(fontSize: 12, color: Palette.muted)),
              const Text('Versi cetak (PDF) tersedia di SekolahApp versi web, menu Rapor.', style: TextStyle(fontSize: 12, color: Palette.muted)),
            ]);
          },
        ),
      );
}
