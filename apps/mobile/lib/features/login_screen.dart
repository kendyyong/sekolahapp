import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../core/supa.dart';
import '../core/ui.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hide = true;

  Future<void> _login() async {
    setState(() => _busy = true);
    await act(context, () => sb.auth.signInWithPassword(email: _email.text.trim(), password: _password.text));
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _reset() async {
    if (_email.text.trim().isEmpty) return toast(context, 'Isi email terlebih dahulu.', error: true);
    await act(context, () => sb.auth.resetPasswordForEmail(_email.text.trim()), ok: 'Tautan atur ulang kata sandi dikirim ke email Anda.');
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final light = Theme.of(context).brightness == Brightness.light;
    return Scaffold(
      backgroundColor: const Color(0xFF0E2A6B),
      body: Stack(fit: StackFit.expand, children: [
        const _Backdrop(),
        SafeArea(
          child: LayoutBuilder(
            builder: (context, box) => SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: box.maxHeight),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 32, 20, 20),
                      child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        const _Hero(),
                        const SizedBox(height: 32),
                        Container(
                          padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
                          decoration: BoxDecoration(
                            color: light ? Colors.white : const Color(0xFF121A28),
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 32, offset: Offset(0, 12))],
                          ),
                          child: AutofillGroup(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                              Text('Masuk ke akun Anda', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                              const SizedBox(height: 4),
                              const Text('Gunakan email dan kata sandi dari sekolah.', style: TextStyle(color: Palette.muted)),
                              const SizedBox(height: 20),
                              TextField(
                                controller: _email,
                                keyboardType: TextInputType.emailAddress,
                                autofillHints: const [AutofillHints.email],
                                textInputAction: TextInputAction.next,
                                decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _password,
                                obscureText: _hide,
                                autofillHints: const [AutofillHints.password],
                                onSubmitted: (_) => _login(),
                                decoration: InputDecoration(
                                  labelText: 'Kata sandi',
                                  prefixIcon: const Icon(Icons.lock_outline),
                                  suffixIcon: IconButton(
                                    icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                    tooltip: _hide ? 'Tampilkan' : 'Sembunyikan',
                                    onPressed: () => setState(() => _hide = !_hide),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 20),
                              FilledButton(onPressed: _busy ? null : _login, child: Text(_busy ? 'Memproses…' : 'Masuk')),
                              const SizedBox(height: 4),
                              TextButton(onPressed: _busy ? null : _reset, child: const Text('Lupa kata sandi?')),
                              Divider(height: 20, color: scheme.outlineVariant.withValues(alpha: 0.5)),
                              const Padding(
                                padding: EdgeInsets.only(bottom: 8),
                                child: Text(
                                  'Akun dibuat oleh sekolah. Belum punya akun? Hubungi admin atau tata usaha sekolah Anda.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: Palette.muted, fontSize: 12.5),
                                ),
                              ),
                            ]),
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Text('© Wahana Media Berkat', textAlign: TextAlign.center, style: TextStyle(color: Colors.white60, fontSize: 12)),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Logo, judul, dan tiga ciri utama di atas formulir.
class _Hero extends StatelessWidget {
  const _Hero();
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Image.asset('assets/images/logo-putih.png', height: 40, semanticLabel: 'SekolahApp'),
        const SizedBox(height: 28),
        Text(
          'Satu aplikasi untuk seluruh warga sekolah',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800, height: 1.2),
        ),
        const SizedBox(height: 8),
        const Text(
          'Murid, orang tua, dan guru terhubung setiap hari: absensi, tugas, rapor, dan kabar sekolah.',
          style: TextStyle(color: Colors.white70, height: 1.4),
        ),
        const SizedBox(height: 18),
        const Wrap(spacing: 8, runSpacing: 8, children: [
          _Chip(Icons.verified_user_outlined, 'Data aman'),
          _Chip(Icons.block_outlined, 'Tanpa iklan'),
          _Chip(Icons.school_outlined, 'Resmi dari sekolah'),
        ]),
      ]);
}

class _Chip extends StatelessWidget {
  const _Chip(this.icon, this.label);
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: Colors.white),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ]),
      );
}

/// Latar: foto sekolah (assets/images/latar-masuk.jpg) di bawah lapisan biru agar teks tetap terbaca.
/// Bila foto belum ada, cukup gradasi biru merek.
class _Backdrop extends StatelessWidget {
  const _Backdrop();
  @override
  Widget build(BuildContext context) => Stack(fit: StackFit.expand, children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF3A6EE8), Color(0xFF173C8F)]),
          ),
        ),
        // Sedikit diburamkan agar teks di atasnya tetap mudah dibaca.
        ImageFiltered(
          imageFilter: ImageFilter.blur(sigmaX: 2.5, sigmaY: 2.5),
          // Diperbesar sedikit agar tepi yang ikut buram tidak terlihat.
          child: Transform.scale(
            scale: 1.04,
            child: Image.asset('assets/images/latar-masuk.jpg', fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x8C102A6B), Color(0xB30E2560), Color(0xF20A1B47)],
              stops: [0, 0.45, 1],
            ),
          ),
        ),
      ]);
}
