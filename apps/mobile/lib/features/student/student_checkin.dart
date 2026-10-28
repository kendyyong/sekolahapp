import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

/// Lokasi saat ini bila izin diberikan; null bila tidak (sekolah tanpa geofence tetap menerima).
Future<Position?> currentPosition() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) return null;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) return null;
    return await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
  } catch (_) {
    return null;
  }
}

const _method = {'manual': 'Dicatat guru', 'qr': 'Kode kelas', 'geo': 'Kode + lokasi', 'leave': 'Surat izin'};

String _how(Map row) => [
      _method[row['method']] ?? row['method'],
      if (row['checked_in_at'] != null) waktu(row['checked_in_at']),
    ].join(' · ');

class StudentCheckIn extends StatefulWidget {
  const StudentCheckIn({super.key});
  @override
  State<StudentCheckIn> createState() => _StudentCheckInState();
}

class _StudentCheckInState extends State<StudentCheckIn> {
  final _code = TextEditingController();
  bool _busy = false;
  Key _loaderKey = UniqueKey();

  Future<Map<String, dynamic>> _load() async {
    final me = await myStudent(session.userId, session.schoolId);
    final history = me == null
        ? <Map<String, dynamic>>[]
        : await sb.from('student_attendance').select('date, status, method, checked_in_at')
            .eq('student_id', me.id).isFilter('teaching_assignment_id', null).order('date', ascending: false).limit(30);
    return {'me': me, 'history': history};
  }

  Future<void> _checkIn(StudentRef me, String code) async {
    if (me.klass == null) return toast(context, 'Anda belum terdaftar di kelas', error: true);
    setState(() => _busy = true);
    final pos = await currentPosition();
    if (!mounted) return;
    final ok = await act(context, () => sb.rpc('student_check_in', params: {
          'p_class': me.klass!.id, 'p_qr_secret': code.trim(), 'p_lat': pos?.latitude, 'p_lng': pos?.longitude,
        }), ok: 'Absen tercatat. Terima kasih!');
    if (mounted) {
      setState(() {
        _busy = false;
        if (ok) _loaderKey = UniqueKey();
      });
    }
  }

  Future<void> _scan(StudentRef me) async {
    final code = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => const _ScanPage()));
    if (code != null && mounted) await _checkIn(me, code);
  }

  @override
  Widget build(BuildContext context) => Loader(
        key: _loaderKey,
        load: _load,
        builder: (context, d, _) {
          final me = d['me'] as StudentRef?;
          if (me == null) return ListView(children: const [EmptyState('Data murid tidak ditemukan.')]);
          final history = d['history'] as List;
          final today = history.where((h) => h['date'] == todayJakarta()).firstOrNull;
          return PageList(children: [
            Section(
              title: 'Absen hari ini',
              child: today != null
                  ? Row(children: [StatusPill(today['status']), const SizedBox(width: 8), Text(_how(today), style: const TextStyle(color: Palette.muted))])
                  : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      FilledButton.icon(onPressed: _busy ? null : () => _scan(me), icon: const Icon(Icons.qr_code_scanner), label: const Text('Pindai QR kelas')),
                      const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('atau ketik kode dari guru', textAlign: TextAlign.center, style: TextStyle(color: Palette.muted))),
                      TextField(controller: _code, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, letterSpacing: 4, fontFamily: 'monospace'), decoration: const InputDecoration(labelText: 'Kode absen kelas')),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: _busy ? null : () => _checkIn(me, _code.text), child: Text(_busy ? 'Memproses…' : 'Absen dengan kode')),
                      const SizedBox(height: 8),
                      const Text('Lokasi Anda dipakai untuk memastikan Anda berada di sekolah.', style: TextStyle(fontSize: 12, color: Palette.muted)),
                    ]),
            ),
            Section(
              title: 'Riwayat 30 hari',
              child: history.isEmpty
                  ? const EmptyState('Belum ada riwayat absen.')
                  : Column(children: [
                      for (final h in history)
                        ListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text(tanggal(h['date'], withDay: true)), subtitle: Text(_how(h)), trailing: StatusPill(h['status'])),
                    ]),
            ),
          ]);
        },
      );
}

class _ScanPage extends StatefulWidget {
  const _ScanPage();
  @override
  State<_ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<_ScanPage> {
  bool _done = false;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Pindai QR kelas')),
        body: MobileScanner(
          onDetect: (capture) {
            final v = capture.barcodes.firstOrNull?.rawValue;
            if (v == null || _done) return;
            _done = true;
            Navigator.pop(context, v);
          },
        ),
      );
}
