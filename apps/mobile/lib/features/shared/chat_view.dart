import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/format.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

/// Percakapan orang tua ↔ wali kelas tentang seorang murid (tabel `student_messages`).
class ChatView extends StatefulWidget {
  const ChatView({super.key, required this.studentId});
  final String studentId;
  @override
  State<ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<ChatView> {
  final _text = TextEditingController();
  List<Map<String, dynamic>>? _msgs;
  String? _error;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ChatView old) {
    super.didUpdateWidget(old);
    if (old.studentId != widget.studentId) {
      _msgs = null;
      _load();
    }
  }

  Future<void> _load() async {
    try {
      final rows = await sb.from('student_messages').select('id, body, created_at, sender_id, profiles:sender_id(full_name)')
          .eq('student_id', widget.studentId).order('created_at', ascending: false).limit(200);
      if (mounted) setState(() => _msgs = rows);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    final ok = await act(context, () => sb.from('student_messages').insert({
          'school_id': session.schoolId, 'student_id': widget.studentId, 'sender_id': session.userId, 'body': body,
        }));
    if (ok) {
      _text.clear();
      await _load();
    }
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final msgs = _msgs;
    return Column(children: [
      Expanded(
        child: msgs == null
            ? Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: msgs.isEmpty
                    ? ListView(children: const [EmptyState('Belum ada pesan. Mulai percakapan di bawah.', icon: Icons.forum_outlined)])
                    : ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.all(12),
                        itemCount: msgs.length,
                        itemBuilder: (_, i) {
                          final m = msgs[i];
                          final mine = m['sender_id'] == session.userId;
                          return Align(
                            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .8),
                              decoration: BoxDecoration(
                                color: mine ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.surface,
                                border: mine ? null : Border.all(color: Palette.line),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                if (!mine) Text(m['profiles']?['full_name'] ?? '', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.primary)),
                                Text(m['body'], style: TextStyle(color: mine ? Theme.of(context).colorScheme.onPrimary : null)),
                                const SizedBox(height: 2),
                                Text(waktu(m['created_at']), style: TextStyle(fontSize: 11, color: mine ? Theme.of(context).colorScheme.onPrimary.withValues(alpha: 0.7) : Palette.muted)),
                              ]),
                            ),
                          );
                        },
                      ),
              ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 8, 8),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _text,
                minLines: 1,
                maxLines: 4,
                maxLength: 4000,
                decoration: const InputDecoration(hintText: 'Tulis pesan…', counterText: ''),
              ),
            ),
            IconButton.filled(onPressed: _sending ? null : _send, tooltip: 'Kirim', icon: const Icon(Icons.send)),
          ]),
        ),
      ),
    ]);
  }
}
