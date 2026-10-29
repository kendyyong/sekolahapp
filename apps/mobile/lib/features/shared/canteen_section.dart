import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

const _entryLabel = {'topup': 'Isi saldo', 'purchase': 'Jajan', 'refund': 'Pembatalan', 'withdraw': 'Tarik tunai', 'adjust': 'Koreksi'};

/// Saldo kantin digital dan transaksi terakhir satu murid (modul paket "canteen").
class CanteenSection extends StatelessWidget {
  const CanteenSection({super.key, required this.studentId, this.guardian = false});
  final String studentId;
  final bool guardian;

  @override
  Widget build(BuildContext context) {
    if (!session.modules.contains('canteen')) return const SizedBox.shrink();
    return Section(
      title: 'Saldo kantin',
      child: FutureBuilder(
        future: Future.wait([
          sb.from('canteen_wallets').select('balance, daily_limit, is_frozen').eq('student_id', studentId).maybeSingle(),
          sb.from('canteen_ledger').select('kind, amount, created_at, items, canteen_stalls(name)').eq('student_id', studentId)
              .order('created_at', ascending: false).limit(5),
        ]),
        builder: (context, snap) {
          if (!snap.hasData) return const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator());
          final w = snap.data![0] as Map<String, dynamic>?;
          final rows = snap.data![1] as List;
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(rupiah((w?['balance'] as num?) ?? 0), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800))),
              if (w?['is_frozen'] == true) const Pill('Kartu dibekukan', tone: Tone.bad),
            ]),
            Text(w?['daily_limit'] != null ? 'Batas jajan ${rupiah(w!['daily_limit'] as num)} per hari' : 'Tanpa batas jajan harian',
                style: const TextStyle(fontSize: 12, color: Palette.muted)),
            for (final r in rows)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(_entryLabel[r['kind']] ?? r['kind']),
                subtitle: Text([r['canteen_stalls']?['name'], waktu(r['created_at'])].whereType<String>().join(' · ')),
                trailing: Text('${(r['amount'] as num) > 0 ? '+' : '−'}${rupiah((r['amount'] as num).abs())}',
                    style: TextStyle(fontWeight: FontWeight.w700, color: (r['amount'] as num) > 0 ? Palette.good : null)),
              ),
            if (guardian)
              const Text('Isi saldo, batas jajan, dan bekukan kartu di SekolahApp versi web, menu Saldo Kantin.',
                  style: TextStyle(fontSize: 12, color: Palette.muted)),
          ]);
        },
      ),
    );
  }
}
