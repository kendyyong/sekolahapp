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
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text.rich(
                      const TextSpan(children: [
                        TextSpan(text: 'Sekolah'),
                        TextSpan(text: 'App', style: TextStyle(color: Palette.accent)),
                      ]),
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    const Text('Masuk untuk murid, orang tua, dan guru.', style: TextStyle(color: Palette.muted)),
                    const SizedBox(height: 28),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      obscureText: _hide,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _login(),
                      decoration: InputDecoration(
                        labelText: 'Kata sandi',
                        suffixIcon: IconButton(
                          icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          tooltip: _hide ? 'Tampilkan' : 'Sembunyikan',
                          onPressed: () => setState(() => _hide = !_hide),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(onPressed: _busy ? null : _login, child: Text(_busy ? 'Memproses…' : 'Masuk')),
                    TextButton(onPressed: _busy ? null : _reset, child: const Text('Lupa kata sandi?')),
                  ]),
                ),
              ),
            ),
          ),
        ),
      );
}
