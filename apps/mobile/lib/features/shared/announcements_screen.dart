import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import 'calendar_screen.dart';

/// Pengumuman sekolah; RLS menyaring sesuai sasaran (semua, guru, murid, orang tua, kelas).
class AnnouncementsScreen extends StatelessWidget {
  const AnnouncementsScreen({super.key});

  @override
  Widget build(BuildContext context) => Loader(
        load: () => sb.from('announcements').select('id, title, body, published_at, profiles:created_by(full_name)')
            .eq('school_id', session.schoolId).order('published_at', ascending: false).limit(50),
        builder: (context, rows, _) => rows.isEmpty
            ? ListView(children: const [EmptyState('Belum ada pengumuman.', icon: Icons.campaign_outlined)])
            : PageList(children: [
                for (final a in rows)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(a['title'], style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 2),
                        Text([if (a['profiles']?['full_name'] != null) a['profiles']['full_name'], waktu(a['published_at'])].join(' · '), style: const TextStyle(fontSize: 12, color: Palette.muted)),
                        const SizedBox(height: 8),
                        Text(a['body']),
                      ]),
                    ),
                  ),
              ]),
      );
}

/// Tab "Info": pengumuman dan kalender pendidikan.
class InfoScreen extends StatelessWidget {
  const InfoScreen({super.key});

  @override
  Widget build(BuildContext context) => const DefaultTabController(
        length: 2,
        child: Column(children: [
          TabBar(tabs: [Tab(text: 'Pengumuman'), Tab(text: 'Kalender')]),
          Expanded(child: TabBarView(children: [AnnouncementsScreen(), CalendarScreen()])),
        ]),
      );
}
