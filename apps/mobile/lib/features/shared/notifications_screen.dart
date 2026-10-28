import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  Future<List<Map<String, dynamic>>> _load() => sb.from('notifications')
      .select('id, title, body, kind, read_at, created_at')
      .eq('user_id', session.userId).order('created_at', ascending: false).limit(100);

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notifikasi')),
        body: Loader(
          load: _load,
          builder: (context, rows, reload) => Column(children: [
            if (rows.any((r) => r['read_at'] == null))
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () async {
                    if (await act(context, () => sb.rpc('mark_all_notifications_read'))) reload();
                  },
                  child: const Text('Tandai semua dibaca'),
                ),
              ),
            Expanded(
              child: rows.isEmpty
                  ? ListView(children: const [EmptyState('Belum ada notifikasi.', icon: Icons.notifications_none)])
                  : ListView.separated(
                      itemCount: rows.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (_, i) {
                        final n = rows[i];
                        final unread = n['read_at'] == null;
                        return ListTile(
                          leading: Icon(Icons.circle, size: 10, color: unread ? Palette.accent : Colors.transparent),
                          minLeadingWidth: 10,
                          title: Text(n['title'], style: TextStyle(fontWeight: unread ? FontWeight.w700 : FontWeight.w400)),
                          subtitle: Text([if (n['body'] != null) n['body'], waktu(n['created_at'])].join('\n')),
                          isThreeLine: n['body'] != null,
                        );
                      },
                    ),
            ),
          ]),
        ),
      );
}
