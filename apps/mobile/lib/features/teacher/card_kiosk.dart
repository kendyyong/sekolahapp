import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

/// Hasil satu pindaian kartu.
class _Scan {
  _Scan.ok(Map<String, dynamic> r)
      : ok = true,
        name = r['full_name'] as String,
        detail = 'Kelas ${r['class_name']} · ${r['direction'] == 'in' ? statusLabel[r['status']] ?? r['status'] : 'Pulang'}',
        tone = r['duplicate'] == true || r['direction'] == 'out' || r['status'] != 'terlambat' ? Tone.good : Tone.warn,
        headline = r['duplicate'] == true
            ? (r['direction'] == 'in' ? 'Sudah absen masuk' : 'Sudah absen pulang')
            : r['direction'] == 'out'
                ? 'Hati-hati di jalan'
                : r['status'] == 'terlambat'
                    ? 'Terlambat'
                    : 'Selamat datang';
  _Scan.error(String message)
      : ok = false,
        name = message,
        detail = 'Hubungi guru piket bila kartu bermasalah.',
        tone = Tone.bad,
        headline = 'Tidak tercatat';

  final bool ok;
  final String headline;
  final String name;
  final String detail;
  final Tone tone;
}

/// Kios absen di HP guru piket: murid menempelkan kartu pelajar ber-QR ke kamera.
class CardKioskScreen extends StatefulWidget {
  const CardKioskScreen({super.key});
  @override
  State<CardKioskScreen> createState() => _CardKioskScreenState();
}

class _CardKioskScreenState extends State<CardKioskScreen> {
  static const _repeat = Duration(seconds: 4);
  String _direction = DateTime.now().toUtc().add(const Duration(hours: 7)).hour >= 12 ? 'out' : 'in';
  final _recent = <String, DateTime>{};
  final _log = <(_Scan, String)>[];
  _Scan? _last;
  bool _busy = false;

  Future<void> _onCode(String code) async {
    final key = '$_direction:$code';
    final now = DateTime.now();
    if (_busy || (_recent[key] != null && now.difference(_recent[key]!) < _repeat)) return;
    _recent[key] = now;
    setState(() => _busy = true);
    _Scan scan;
    try {
      final r = await guard(() => sb.rpc('card_scan', params: {'p_code': code, 'p_direction': _direction}));
      scan = _Scan.ok(Map<String, dynamic>.from(r as Map));
      HapticFeedback.lightImpact();
    } catch (e) {
      scan = _Scan.error(e.toString());
      HapticFeedback.heavyImpact();
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _last = scan;
      _log.insert(0, (scan, waktu(DateTime.now().toUtc().toIso8601String()).split(', ').last));
      if (_log.length > 10) _log.removeLast();
    });
  }

  @override
  Widget build(BuildContext context) {
    final last = _last;
    return Scaffold(
      appBar: AppBar(title: const Text('Kios kartu pelajar')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'in', label: Text('Masuk'), icon: Icon(Icons.login)),
              ButtonSegment(value: 'out', label: Text('Pulang'), icon: Icon(Icons.logout)),
            ],
            selected: {_direction},
            onSelectionChanged: (s) => setState(() => _direction = s.first),
          ),
        ),
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Stack(fit: StackFit.expand, children: [
            MobileScanner(onDetect: (c) {
              final v = c.barcodes.firstOrNull?.rawValue;
              if (v != null) _onCode(v);
            }),
            if (_busy) const ColoredBox(color: Color(0x55000000), child: Center(child: CircularProgressIndicator())),
          ]),
        ),
        if (last == null)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Arahkan QR kartu pelajar ke kamera.', style: TextStyle(color: Palette.muted)),
          )
        else
          Container(
            width: double.infinity,
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: toneColors(last.tone).$2,
              border: Border.all(color: toneColors(last.tone).$1, width: 2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(children: [
              Text(last.headline.toUpperCase(), style: TextStyle(fontWeight: FontWeight.w700, color: toneColors(last.tone).$1, letterSpacing: .5)),
              const SizedBox(height: 4),
              Text(last.name, textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(last.detail, textAlign: TextAlign.center, style: const TextStyle(color: Palette.muted)),
            ]),
          ),
        Expanded(
          child: ListView(padding: const EdgeInsets.symmetric(horizontal: 16), children: [
            for (final (s, at) in _log)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(s.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: Text(at, style: TextStyle(color: toneColors(s.tone).$1)),
              ),
          ]),
        ),
      ]),
    );
  }
}
