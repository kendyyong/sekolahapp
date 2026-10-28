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
                  leading: Icon(r.key == session.active?.key ? Icons.radio_button_checked : Icons.radio_button_off, color: Palette.brand),
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
        ]),
      );
}
