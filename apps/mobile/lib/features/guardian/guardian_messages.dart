import 'package:flutter/material.dart';

import '../../core/supa.dart';
import '../../core/ui.dart';
import '../shared/chat_view.dart';
import 'children.dart';

/// Pesan dengan wali kelas tentang anak terpilih.
class GuardianMessages extends StatelessWidget {
  const GuardianMessages({super.key});

  @override
  Widget build(BuildContext context) => ChildScope(
        builder: (context, c) {
          final homeroomId = c.klass?.homeroomTeacherId;
          if (homeroomId == null) return EmptyState('Kelas ${c.fullName} belum memiliki wali kelas.');
          return Column(children: [
            FutureBuilder(
              future: sb.from('profiles').select('full_name').eq('id', homeroomId).maybeSingle(),
              builder: (context, snap) => Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                child: Text(snap.data == null ? 'Wali kelas ${c.klass!.name}' : '${snap.data!['full_name']} · wali kelas ${c.klass!.name}', style: const TextStyle(color: Palette.muted)),
              ),
            ),
            const Divider(height: 1),
            Expanded(child: ChatView(studentId: c.id)),
          ]);
        },
      );
}
