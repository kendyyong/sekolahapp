import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

/// Informasi biaya sekolah dari TU. Pembayaran dilakukan orang tua.
class StudentFees extends StatelessWidget {
  const StudentFees({super.key});

  Future<Map<String, dynamic>?> _load() async {
    final me = await myStudent(session.userId, session.schoolId);
    if (me == null) return null;
    final r = await Future.wait([
      sb.from('invoices').select('id, title, due_on, total, paid_amount, status').eq('student_id', me.id).neq('status', 'void').order('due_on', ascending: false),
      sb.from('fee_types').select('id, name, default_amount, is_monthly').eq('school_id', session.schoolId).eq('is_active', true).order('name'),
    ]);
    return {'invoices': r[0], 'fees': r[1]};
  }

  @override
  Widget build(BuildContext context) => Loader(
        load: _load,
        builder: (context, d, _) {
          if (d == null) return ListView(children: const [EmptyState('Data murid tidak ditemukan.')]);
          return PageList(children: [
            const Text('Informasi dari Tata Usaha. Pembayaran dilakukan oleh orang tua.', style: TextStyle(color: Palette.muted)),
            Section(
              title: 'Tagihan',
              child: (d['invoices'] as List).isEmpty
                  ? const EmptyState('Belum ada tagihan.')
                  : Column(children: [
                      for (final i in d['invoices'] as List)
                        ListTile(contentPadding: EdgeInsets.zero, title: Text(i['title']), subtitle: Text('${rupiah(i['total'])} · jatuh tempo ${tanggal(i['due_on'])}'), trailing: StatusPill(i['status'])),
                    ]),
            ),
            Section(
              title: 'Daftar biaya',
              child: Column(children: [
                for (final f in d['fees'] as List)
                  ListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text('${f['name']}${f['is_monthly'] == true ? ' / bulan' : ''}'), trailing: Text(rupiah(f['default_amount']), style: const TextStyle(fontWeight: FontWeight.w700))),
              ]),
            ),
          ]);
        },
      );
}
