import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../app.dart';
import '../../core/push.dart';
import '../../core/session.dart';
import '../../core/supa.dart';
import '../../core/ui.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final _name = TextEditingController(text: session.profile?['full_name']);
  late final _phone = TextEditingController(text: session.profile?['phone']);
  final _password = TextEditingController();
  bool? _deletionPending;

  @override
  void initState() {
    super.initState();
    _loadDeletion();
  }

  Future<void> _loadDeletion() async {
    final row = await sb.from('account_deletion_requests').select('id').eq('user_id', session.userId).eq('status', 'pending').maybeSingle();
    if (mounted) setState(() => _deletionPending = row != null);
  }

  // Kebijakan Google Play & UU PDP: pengguna harus bisa meminta hapus akun dari dalam aplikasi.
  Future<void> _requestDeletion() async {
    final reason = TextEditingController();
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus akun?'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Akun dan data pribadi Anda dihapus paling lambat 14 hari. Catatan pendidikan yang wajib disimpan sekolah tetap ada tanpa terhubung ke akun Anda.'),
          const SizedBox(height: 12),
          TextField(controller: reason, maxLength: 500, decoration: const InputDecoration(labelText: 'Alasan (opsional)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Palette.bad), onPressed: () => Navigator.pop(ctx, true), child: const Text('Minta hapus akun')),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    if (await act(context, () => sb.rpc('request_account_deletion', params: {'p_reason': reason.text.trim()}),
        ok: 'Permintaan hapus akun terkirim.')) {
      _loadDeletion();
    }
  }

  Future<void> _cancelDeletion() async {
    if (await act(context, () => sb.rpc('cancel_account_deletion'), ok: 'Permintaan hapus akun dibatalkan.')) _loadDeletion();
  }

  Future<void> _save() async {
    final ok = await act(context, () async {
      await sb.from('profiles').update({'full_name': _name.text.trim(), 'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim()}).eq('id', session.userId);
      if (_password.text.isNotEmpty) {
        if (_password.text.length < 8) throw AppError('Kata sandi minimal 8 karakter');
        await sb.auth.updateUser(UserAttributes(password: _password.text));
      }
    }, ok: 'Profil disimpan.');
    if (ok) {
      _password.clear();
      session.load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Profil')),
        body: PageList(children: [
          Section(
            title: 'Peran saya',
            child: Column(children: [
              for (final r in session.roles)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(r.key == session.active?.key ? Icons.radio_button_checked : Icons.radio_button_off, color: Theme.of(context).colorScheme.primary),
                  title: Text(roleLabel[r.role] ?? r.role),
                  subtitle: Text(r.schoolName),
                  onTap: () {
                    session.switchTo(r);
                    Navigator.pop(context);
                  },
                ),
            ]),
          ),
          Section(
            title: 'Data diri',
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(session.user?.email ?? '', style: const TextStyle(color: Palette.muted)),
              const SizedBox(height: 12),
              TextField(controller: _name, decoration: const InputDecoration(labelText: 'Nama lengkap')),
              const SizedBox(height: 12),
              TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Nomor HP / WhatsApp')),
              const SizedBox(height: 12),
              TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Kata sandi baru (opsional)')),
              const SizedBox(height: 16),
              FilledButton(onPressed: _save, child: const Text('Simpan')),
            ]),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.logout),
            label: const Text('Keluar'),
            onPressed: () async {
              await Push.unregister();
              await session.signOut();
              if (context.mounted) Navigator.popUntil(context, (r) => r.isFirst);
            },
          ),
          const SizedBox(height: 8),
          if (_deletionPending == true)
            TextButton(onPressed: _cancelDeletion, child: const Text('Permintaan hapus akun sedang diproses · Batalkan'))
          else if (_deletionPending == false)
            TextButton(onPressed: _requestDeletion, style: TextButton.styleFrom(foregroundColor: Palette.bad), child: const Text('Hapus akun')),
        ]),
      );
}
