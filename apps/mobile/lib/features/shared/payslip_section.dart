import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/// "Oktober 2026" dari tanggal periode "2026-10-01".
String periodLabel(String period) => '${_bulan[int.parse(period.substring(5, 7)) - 1]} ${period.substring(0, 4)}';

/// Rincian hitungan satu baris slip, sama dengan versi web: "20 hari × Rp15.000".
String lineDetail(Map<String, dynamic> l) {
  final rate = rupiah(l['rate'] as num);
  return switch (l['calc']) {
    'per_attendance' || 'per_late' || 'per_absence' => '${l['qty']} hari × $rate',
    'per_jp' => '${l['qty']} JP × $rate',
    'percent_base' => '${(l['rate'] as num) % 1 == 0 ? (l['rate'] as num).toInt() : l['rate']}% × gaji pokok',
    _ => '',
  };
}

/// Slip gaji milik guru/staf yang masuk (modul paket "payroll"); hanya bulan yang sudah dibayar.
class PayslipSection extends StatelessWidget {
  const PayslipSection({super.key});

  @override
  Widget build(BuildContext context) {
    if (!session.modules.contains('payroll')) return const SizedBox.shrink();
    return Section(
      title: 'Slip gaji',
      child: FutureBuilder(
        future: sb.from('payslips').select('*, payroll_runs!inner(period, status, paid_on, paid_method)')
            .eq('user_id', sb.auth.currentUser!.id).eq('payroll_runs.status', 'paid').limit(24),
        builder: (context, snap) {
          if (!snap.hasData) return const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator());
          final slips = [...snap.data as List]
            ..sort((a, b) => (b['payroll_runs']['period'] as String).compareTo(a['payroll_runs']['period'] as String));
          if (slips.isEmpty) return const EmptyState('Belum ada slip gaji.');
          return Column(children: [
            for (final s in slips.take(6))
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(periodLabel(s['payroll_runs']['period'])),
                subtitle: Text('Dibayar ${tanggal(s['payroll_runs']['paid_on'])}'),
                trailing: Text(rupiah(s['net'] as num), style: const TextStyle(fontWeight: FontWeight.w700)),
                onTap: () => showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _SlipSheet(s)),
              ),
          ]);
        },
      ),
    );
  }
}

class _SlipSheet extends StatelessWidget {
  const _SlipSheet(this.s);
  final Map<String, dynamic> s;

  @override
  Widget build(BuildContext context) {
    final lines = (s['lines'] as List).cast<Map<String, dynamic>>();
    final adj = (s['adjustments'] as List).cast<Map<String, dynamic>>();
    Widget row(String name, String detail, num amount) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name),
                if (detail.isNotEmpty) Text(detail, style: const TextStyle(fontSize: 12, color: Palette.muted)),
              ]),
            ),
            Text(rupiah(amount.abs())),
          ]),
        );
    Widget group(String title, String kind, num total) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(top: 12, bottom: 4), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700))),
          for (final l in lines.where((l) => l['kind'] == kind)) row(l['name'], lineDetail(l), l['amount'] as num),
          for (final a in adj.where((a) => kind == 'earning' ? (a['amount'] as num) > 0 : (a['amount'] as num) < 0))
            row(a['label'], 'Penyesuaian', a['amount'] as num),
          const Divider(),
          Row(children: [const Expanded(child: Text('Jumlah')), Text(rupiah(total), style: const TextStyle(fontWeight: FontWeight.w700))]),
        ]);
    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        builder: (context, scroll) => ListView(controller: scroll, padding: const EdgeInsets.all(20), children: [
          Text('Slip gaji ${periodLabel(s['payroll_runs']['period'])}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          Text([s['full_name'], s['position']].whereType<String>().join(' · '), style: const TextStyle(color: Palette.muted)),
          group('Pendapatan', 'earning', s['gross'] as num),
          group('Potongan', 'deduction', s['deductions'] as num),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                const Expanded(child: Text('Gaji bersih diterima', style: TextStyle(fontWeight: FontWeight.w600))),
                Text(rupiah(s['net'] as num), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              ]),
            ),
          ),
          const Text('Cetak atau simpan PDF dari SekolahApp versi web, menu Slip Gaji.', style: TextStyle(fontSize: 12, color: Palette.muted)),
        ]),
      ),
    );
  }
}
