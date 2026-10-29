import 'package:flutter/material.dart';

import 'format.dart';
import 'supa.dart';

/// Palet sama dengan dasbor web: tinta biru buku rapor + merah pena guru.
class Palette {
  static const paper = Color(0xFFF5F7FB);
  static const ink = Color(0xFF18233D);
  static const muted = Color(0xFF5B6680);
  static const line = Color(0xFFDFE3EC);
  static const brand = Color(0xFF1F4FB8);
  static const brandSoft = Color(0xFFE6EDFB);
  static const accent = Color(0xFFC8372D);
  static const good = Color(0xFF1D7A4C);
  static const goodSoft = Color(0xFFE3F3EA);
  static const warn = Color(0xFF9A6A00);
  static const warnSoft = Color(0xFFFBF1D9);
  static const bad = Color(0xFFC8372D);
  static const badSoft = Color(0xFFFBE9E7);
}

/// Tema aplikasi. `brand`: warna sekolah (paket Enterprise); di mode gelap dibuat lebih terang agar terbaca.
ThemeData buildTheme(Brightness b, {Color? brand}) {
  final light = b == Brightness.light;
  final seed = brand ?? Palette.brand;
  final primary = light ? seed : (brand == null ? const Color(0xFF7EA4FF) : Color.lerp(brand, Colors.white, 0.45)!);
  final scheme = ColorScheme.fromSeed(seedColor: seed, brightness: b, primary: primary, error: Palette.bad);
  final line = light ? Palette.line : const Color(0xFF243046);
  final surface = light ? Colors.white : const Color(0xFF121A28);
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: light ? Palette.paper : const Color(0xFF0B111C),
    dividerColor: line,
    appBarTheme: AppBarTheme(
      centerTitle: false,
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: line)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: primary.withValues(alpha: 0.14),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
            fontSize: 12,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          )),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: surface,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: line)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: line)),
      isDense: true,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
  );
}

/// Logo sekolah, atau inisial di kotak warna utama bila belum ada logo / gagal dimuat.
class SchoolLogo extends StatelessWidget {
  const SchoolLogo({super.key, required this.name, this.url, this.size = 36});
  final String name;
  final String? url;
  final double size;

  String get _initials {
    final words = name
        .replaceFirst(RegExp(r'^(SD|SMP|SMA|SMK|MI|MTs|MA|TK)\s+(Negeri|N|Swasta|IT|Islam)?\s*', caseSensitive: false), '')
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty && RegExp(r'^[A-Za-z0-9]').hasMatch(w));
    final s = words.take(2).map((w) => w[0]).join().toUpperCase();
    return s.isEmpty ? 'S' : s;
  }

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, borderRadius: BorderRadius.circular(size * 0.25)),
      child: Text(_initials, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.36)),
    );
    if (url == null) return fallback;
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.08),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(size * 0.25), border: Border.all(color: Palette.line)),
      child: Image.network(url!, fit: BoxFit.contain, errorBuilder: (_, _, _) => fallback),
    );
  }
}

(Color, Color) toneColors(Tone t) => switch (t) {
      Tone.good => (Palette.good, Palette.goodSoft),
      Tone.warn => (Palette.warn, Palette.warnSoft),
      Tone.bad => (Palette.bad, Palette.badSoft),
      Tone.info => (Palette.brand, Palette.brandSoft),
      Tone.neutral => (Palette.muted, const Color(0xFFEEF0F5)),
    };

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.tone = Tone.neutral});
  final String text;
  final Tone tone;
  @override
  Widget build(BuildContext context) {
    final (fg, bg) = toneColors(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(text, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) => Pill(statusLabel[status] ?? status, tone: statusTone[status] ?? Tone.neutral);
}

class Section extends StatelessWidget {
  const Section({super.key, required this.title, required this.child, this.action});
  final String title;
  final Widget child;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
              ?action,
            ]),
            const SizedBox(height: 8),
            child,
          ]),
        ),
      );
}

class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.tone});
  final String label;
  final Widget value;
  final Tone? tone;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Palette.muted, letterSpacing: .4)),
            const SizedBox(height: 6),
            DefaultTextStyle.merge(
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: tone == null ? null : toneColors(tone!).$1),
              child: value,
            ),
          ]),
        ),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key, this.icon = Icons.inbox_outlined});
  final String text;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
        child: Column(children: [
          Icon(icon, color: Palette.muted, size: 32),
          const SizedBox(height: 8),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Palette.muted)),
        ]),
      );
}

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? Palette.bad : null, behavior: SnackBarBehavior.floating));
}

/// Jalankan aksi, tampilkan pesan sukses atau error. Mengembalikan true bila berhasil.
Future<bool> act(BuildContext context, Future<void> Function() fn, {String? ok}) async {
  try {
    await guard(fn);
    if (context.mounted && ok != null) toast(context, ok);
    return true;
  } catch (e) {
    if (context.mounted) toast(context, e.toString(), error: true);
    return false;
  }
}

/// Memuat data lalu membangun tampilan; tarik ke bawah untuk memuat ulang.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  late Future<T> _future = widget.load();

  Future<void> _reload() async {
    final f = widget.load();
    setState(() => _future = f);
    await f.catchError((_) => null as T);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) {
            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView(children: [
                EmptyState('Gagal memuat data.\n${snap.error}', icon: Icons.cloud_off),
                Center(child: TextButton(onPressed: _reload, child: const Text('Coba lagi'))),
              ]),
            );
          }
          return RefreshIndicator(onRefresh: _reload, child: widget.builder(context, snap.data as T, _reload));
        },
      );
}

/// Daftar isi halaman dengan jarak standar.
class PageList extends StatelessWidget {
  const PageList({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: children.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, i) => children[i],
      );
}
