import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/data.dart';
import '../../core/ui.dart';

/// Anak yang sedang dipilih; dipakai bersama oleh semua tab orang tua.
final selectedChild = ValueNotifier<String?>(null);

Future<List<StudentRef>>? _cache;
Future<List<StudentRef>> children({bool refresh = false}) {
  if (refresh || _cache == null) _cache = myChildren(session.userId, session.schoolId);
  return _cache!;
}

/// Bangun tampilan untuk anak terpilih; tampilkan pemilih bila anak lebih dari satu.
class ChildScope extends StatelessWidget {
  const ChildScope({super.key, required this.builder});
  final Widget Function(BuildContext context, StudentRef child) builder;

  @override
  Widget build(BuildContext context) => FutureBuilder<List<StudentRef>>(
        future: children(),
        builder: (context, snap) {
          if (!snap.hasData) {
            return snap.hasError ? EmptyState('Gagal memuat data anak.\n${snap.error}', icon: Icons.cloud_off) : const Center(child: CircularProgressIndicator());
          }
          final kids = snap.data!;
          if (kids.isEmpty) return const EmptyState('Akun Anda belum ditautkan ke data murid. Hubungi admin sekolah.');
          return ValueListenableBuilder<String?>(
            valueListenable: selectedChild,
            builder: (context, id, _) {
              final child = kids.where((k) => k.id == id).firstOrNull ?? kids.first;
              return Column(children: [
                if (kids.length > 1)
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Row(children: [
                      for (final k in kids)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(label: Text(k.fullName.split(' ').first), selected: k.id == child.id, onSelected: (_) => selectedChild.value = k.id),
                        ),
                    ]),
                  ),
                Expanded(child: KeyedSubtree(key: ValueKey(child.id), child: builder(context, child))),
              ]);
            },
          );
        },
      );
}
