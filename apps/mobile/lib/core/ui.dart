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

ThemeData buildTheme(Brightness b) {
  final scheme = ColorScheme.fromSeed(seedColor: Palette.brand, brightness: b, primary: b == Brightness.light ? Palette.brand : const Color(0xFF7EA4FF), error: Palette.bad);
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: b == Brightness.light ? Palette.paper : const Color(0xFF10151F),
    appBarTheme: const AppBarTheme(centerTitle: false, scrolledUnderElevation: 0.5),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: b == Brightness.light ? Palette.line : const Color(0xFF2A3447))),
    ),
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(), isDense: true),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(0, 46))),
  );
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
