import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';
import 'children.dart';

const _methodLabel = {
  'qris': 'QRIS', 'va': 'Virtual Account bank', 'ewallet': 'E-wallet (OVO, DANA, ShopeePay)', 'retail': 'Gerai (Alfamart/Indomaret)',
  'cash': 'Tunai di TU', 'transfer': 'Transfer bank',
};

class GuardianInvoices extends StatelessWidget {
  const GuardianInvoices({super.key});

  @override
  Widget build(BuildContext context) => ChildScope(
        builder: (context, c) => Loader(
          load: () => sb.from('invoices').select('id, number, title, due_on, total, paid_amount, status')
              .eq('student_id', c.id).neq('status', 'void').order('due_on', ascending: false).limit(60),
          builder: (context, rows, reload) {
            final owed = rows.where((i) => i['status'] != 'paid').fold<num>(0, (s, i) => s + (i['total'] as num) - (i['paid_amount'] as num));
            return PageList(children: [
              StatTile(label: 'Sisa tagihan ${c.fullName.split(' ').first}', value: Text(rupiah(owed)), tone: owed > 0 ? Tone.warn : Tone.good),
              if (rows.isEmpty) const EmptyState('Belum ada tagihan.', icon: Icons.receipt_long_outlined),
              for (final i in rows)
                Card(
                  child: ListTile(
                    title: Text(i['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${i['number']}\nJatuh tempo ${tanggal(i['due_on'])} · sisa ${rupiah((i['total'] as num) - (i['paid_amount'] as num))}'),
                    isThreeLine: true,
                    trailing: StatusPill(i['status']),
                    onTap: () async {
                      await Navigator.push(context, MaterialPageRoute(builder: (_) => InvoiceDetail(invoiceId: i['id'])));
                      reload();
                    },
                  ),
                ),
            ]);
          },
        ),
      );
}

class InvoiceDetail extends StatefulWidget {
  const InvoiceDetail({super.key, required this.invoiceId});
  final String invoiceId;
  @override
  State<InvoiceDetail> createState() => _InvoiceDetailState();
}

class _InvoiceDetailState extends State<InvoiceDetail> {
  String _method = 'qris';
  bool _busy = false;
  Key _key = UniqueKey();

  Future<Map<String, dynamic>> _load() async {
    final r = await Future.wait([
      sb.from('invoices').select('id, number, title, due_on, total, paid_amount, status').eq('id', widget.invoiceId),
      sb.from('invoice_items').select('id, description, amount, discount').eq('invoice_id', widget.invoiceId),
      sb.from('payments').select('id, amount, method, status, receipt_number, paid_at, created_at, checkout_url, expires_at')
          .eq('invoice_id', widget.invoiceId).order('created_at', ascending: false),
    ]);
    // Bagian "Bayar online" hanya tampil bila sekolah sudah mengaktifkan pembayaran online.
    final online = await sb.rpc('online_payment_enabled', params: {'p_school': session.schoolId});
    return {'inv': r[0].first, 'items': r[1], 'pays': r[2], 'online': online == true};
  }

  Future<void> _pay() async {
    setState(() => _busy = true);
    String? url;
    await act(context, () async {
      final res = await sb.functions.invoke('payments-create', body: {'invoice_id': widget.invoiceId, 'method': _method});
      url = (res.data as Map?)?['checkout_url'] as String?;
      if (url == null) throw AppError('Gagal membuat tautan pembayaran');
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (url != null) {
      await launchUrl(Uri.parse(url!), mode: LaunchMode.externalApplication);
      if (mounted) {
        toast(context, 'Setelah membayar, tarik layar ke bawah untuk memperbarui status.');
        setState(() => _key = UniqueKey());
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Tagihan')),
        body: Loader(
          key: _key,
          load: _load,
          builder: (context, d, _) {
            final inv = d['inv'] as Map;
            final rest = (inv['total'] as num) - (inv['paid_amount'] as num);
            return PageList(children: [
              Row(children: [
                Expanded(child: Text(inv['title'], style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800))),
                StatusPill(inv['status']),
              ]),
              Text('${inv['number']} · jatuh tempo ${tanggal(inv['due_on'])}', style: const TextStyle(color: Palette.muted)),
              Section(
                title: 'Rincian',
                child: Column(children: [
                  for (final it in d['items'] as List)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: Text(it['description']),
                      subtitle: (it['discount'] as num) > 0 ? Text('Potongan ${rupiah(it['discount'])}', style: const TextStyle(color: Palette.good)) : null,
                      trailing: Text(rupiah((it['amount'] as num) - (it['discount'] as num))),
                    ),
                  const Divider(),
                  ListTile(contentPadding: EdgeInsets.zero, dense: true, title: const Text('Sudah dibayar'), trailing: Text(rupiah(inv['paid_amount']))),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Sisa dibayar', style: TextStyle(fontWeight: FontWeight.w800)),
                    trailing: Text(rupiah(rest), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ),
                ]),
              ),
              if (inv['status'] != 'paid' && d['online'] != true)
                const Section(
                  title: 'Cara bayar',
                  child: Text('Silakan bayar tunai atau transfer melalui loket Tata Usaha sekolah. '
                      'Pembayaran online akan tersedia setelah sekolah mengaktifkannya.', style: TextStyle(color: Palette.muted)),
                ),
              if (inv['status'] != 'paid' && d['online'] == true)
                Section(
                  title: 'Bayar online',
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    RadioGroup<String>(
                      groupValue: _method,
                      onChanged: (v) => setState(() => _method = v!),
                      child: Column(children: [
                        for (final m in ['qris', 'va', 'ewallet', 'retail'])
                          RadioListTile<String>(contentPadding: EdgeInsets.zero, dense: true, value: m, title: Text(_methodLabel[m]!)),
                      ]),
                    ),
                    const Text('Biaya layanan (bila ada) ditampilkan sebelum Anda membayar. Bisa juga membayar tunai di loket Tata Usaha.', style: TextStyle(fontSize: 12, color: Palette.muted)),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _busy ? null : _pay, child: Text(_busy ? 'Menyiapkan…' : 'Bayar ${rupiah(rest)}')),
                  ]),
                ),
              if ((d['pays'] as List).isNotEmpty)
                Section(
                  title: 'Riwayat pembayaran',
                  child: Column(children: [
                    for (final p in d['pays'] as List)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${_methodLabel[p['method']] ?? p['method']} · ${rupiah(p['amount'])}'),
                        subtitle: Text(p['receipt_number'] != null ? 'Kuitansi ${p['receipt_number']} · ${waktu(p['paid_at'])}' : waktu(p['created_at'])),
                        trailing: p['status'] == 'pending' && p['checkout_url'] != null && p['expires_at'] != null && DateTime.parse(p['expires_at']).isAfter(DateTime.now())
                            ? TextButton(onPressed: () => launchUrl(Uri.parse(p['checkout_url']), mode: LaunchMode.externalApplication), child: const Text('Lanjutkan'))
                            : StatusPill(p['status']),
                      ),
                  ]),
                ),
            ]);
          },
        ),
      );
}
