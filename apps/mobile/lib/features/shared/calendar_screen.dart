import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

/// Kalender pendidikan yang diisi admin sekolah / kepala sekolah; RLS menyaring sesuai sasaran.
const _columns = 'id, title, description, kind, starts_on, ends_on, audience';

const kindLabel = {
  'libur': 'Libur', 'ujian': 'Ujian', 'rapor': 'Rapor', 'kegiatan': 'Kegiatan', 'akademik': 'Akademik', 'lainnya': 'Agenda',
};
const kindTone = {
  'libur': Tone.bad, 'ujian': Tone.warn, 'rapor': Tone.good, 'kegiatan': Tone.info, 'akademik': Tone.neutral, 'lainnya': Tone.neutral,
};
const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String _iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
DateTime _date(String iso) => DateTime.utc(int.parse(iso.substring(0, 4)), int.parse(iso.substring(5, 7)), int.parse(iso.substring(8, 10)));

/// "3 Nov 2026", "3–5 Nov 2026", atau "28 Nov – 2 Des 2026".
String rangeLabel(String from, String to) {
  final a = _date(from), b = _date(to);
  String mon(DateTime d) => _bulan[d.month - 1].substring(0, 3);
  if (from == to) return '${a.day} ${mon(a)} ${a.year}';
  if (a.year == b.year && a.month == b.month) return '${a.day}–${b.day} ${mon(a)} ${a.year}';
  if (a.year == b.year) return '${a.day} ${mon(a)} – ${b.day} ${mon(b)} ${a.year}';
  return '${a.day} ${mon(a)} ${a.year} – ${b.day} ${mon(b)} ${b.year}';
}

/// Libur yang berlaku untuk murid pada [date] (sama dengan holiday_on di database).
List<Map> holidaysOn(List events, String date) => [
      for (final e in events)
        if (e['kind'] == 'libur' && e['audience'] != 'staff' && (e['starts_on'] as String).compareTo(date) <= 0 && (e['ends_on'] as String).compareTo(date) >= 0) e as Map,
    ];

class _EventTile extends StatelessWidget {
  const _EventTile(this.e);
  final Map e;
  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(e['title'], style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text([rangeLabel(e['starts_on'], e['ends_on']), if ((e['description'] ?? '').toString().isNotEmpty) e['description']].join('\n')),
        isThreeLine: (e['description'] ?? '').toString().isNotEmpty,
        trailing: Pill(kindLabel[e['kind']] ?? 'Agenda', tone: kindTone[e['kind']] ?? Tone.neutral),
      );
}

class _HolidayBanner extends StatelessWidget {
  const _HolidayBanner(this.titles);
  final String titles;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Palette.badSoft, borderRadius: BorderRadius.circular(10)),
        child: Text('Hari ini libur: $titles', style: const TextStyle(color: Palette.bad, fontWeight: FontWeight.w600)),
      );
}

/// Kartu beranda: libur hari ini + agenda 45 hari ke depan.
class AgendaSection extends StatelessWidget {
  const AgendaSection({super.key});

  Future<List> _load() async {
    final today = todayJakarta();
    final until = _iso(_date(today).add(const Duration(days: 45)));
    return sb.from('calendar_events').select(_columns).eq('school_id', session.schoolId)
        .gte('ends_on', today).lte('starts_on', until).order('starts_on').limit(5);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List>(
        future: _load(),
        builder: (context, snap) {
          final events = snap.data ?? const [];
          final holiday = holidaysOn(events, todayJakarta());
          return Section(
            title: 'Kalender pendidikan',
            action: TextButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CalendarPage())),
              child: const Text('Lihat'),
            ),
            child: snap.connectionState != ConnectionState.done
                ? const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()))
                : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (holiday.isNotEmpty) _HolidayBanner(holiday.map((e) => e['title']).join(', ')),
                    if (events.isEmpty)
                      const EmptyState('Tidak ada agenda dalam 45 hari ke depan.', icon: Icons.event_available_outlined)
                    else
                      for (final e in events) _EventTile(e),
                  ]),
          );
        },
      );
}

/// Halaman penuh (dibuka dari beranda).
class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Kalender Pendidikan')), body: const CalendarScreen());
}

/// Kalender bulanan: kisi tanggal dengan titik warna + daftar agenda bulan itu.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  late DateTime _month = DateTime.utc(_date(todayJakarta()).year, _date(todayJakarta()).month);
  Key _key = UniqueKey();

  void _shift(int n) => setState(() {
        _month = DateTime.utc(_month.year, _month.month + n);
        _key = UniqueKey();
      });

  Future<List> _load() {
    final first = _iso(_month);
    final last = _iso(DateTime.utc(_month.year, _month.month + 1, 0));
    return sb.from('calendar_events').select(_columns).eq('school_id', session.schoolId)
        .lte('starts_on', last).gte('ends_on', first).order('starts_on').order('title');
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
        child: Row(children: [
          IconButton(tooltip: 'Bulan sebelumnya', onPressed: () => _shift(-1), icon: const Icon(Icons.chevron_left)),
          Expanded(
            child: Text('${_bulan[_month.month - 1]} ${_month.year}', textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          ),
          IconButton(tooltip: 'Bulan berikutnya', onPressed: () => _shift(1), icon: const Icon(Icons.chevron_right)),
        ]),
      ),
      Expanded(
        child: Loader<List>(
          key: _key,
          load: _load,
          builder: (context, events, _) {
            final today = todayJakarta();
            final lead = _month.weekday - 1; // Senin = kolom pertama
            final days = DateTime.utc(_month.year, _month.month + 1, 0).day;
            return PageList(children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: GridView.count(
                    crossAxisCount: 7,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: 0.95,
                    children: [
                      for (final (i, d) in const ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].indexed)
                        Center(child: Text(d, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: i == 6 ? Palette.bad : Palette.muted))),
                      for (var i = 0; i < lead; i++) const SizedBox.shrink(),
                      for (var day = 1; day <= days; day++)
                        Builder(builder: (context) {
                          final date = DateTime.utc(_month.year, _month.month, day);
                          final iso = _iso(date);
                          final here = [
                            for (final e in events)
                              if ((e['starts_on'] as String).compareTo(iso) <= 0 && (e['ends_on'] as String).compareTo(iso) >= 0) e,
                          ];
                          final holiday = holidaysOn(here, iso).isNotEmpty;
                          final isToday = iso == today;
                          return Container(
                            margin: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: isToday ? primary : holiday ? Palette.badSoft : null,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              Text('$day', style: TextStyle(
                                fontWeight: isToday || holiday ? FontWeight.w800 : FontWeight.w500,
                                color: isToday ? Colors.white : (holiday || date.weekday == 7) ? Palette.bad : null,
                              )),
                              const SizedBox(height: 2),
                              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                                for (final e in here.take(3))
                                  Container(
                                    width: 5,
                                    height: 5,
                                    margin: const EdgeInsets.symmetric(horizontal: 1),
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isToday ? Colors.white : toneColors(kindTone[e['kind']] ?? Tone.neutral).$1,
                                    ),
                                  ),
                              ]),
                            ]),
                          );
                        }),
                    ],
                  ),
                ),
              ),
              Section(
                title: 'Agenda bulan ini',
                child: events.isEmpty
                    ? const EmptyState('Belum ada agenda di bulan ini.', icon: Icons.event_note_outlined)
                    : Column(children: [for (final e in events) _EventTile(e)]),
              ),
            ]);
          },
        ),
      ),
    ]);
  }
}

/// Teks libur pada [date] untuk sekolah aktif, atau null bila hari sekolah biasa.
Future<String?> schoolHoliday(String date) async =>
    await sb.rpc('school_holiday', params: {'p_school': session.schoolId, 'p_date': date}) as String?;
