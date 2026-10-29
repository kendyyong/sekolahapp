import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide Session;

import 'core/push.dart';
import 'core/session.dart';
import 'core/supa.dart';
import 'core/ui.dart';
import 'features/login_screen.dart';
import 'features/role_shell.dart';

final session = AppSession();

class SekolahApp extends StatelessWidget {
  const SekolahApp({super.key});
  @override
  // Tema mengikuti warna & nama aplikasi sekolah aktif (paket Enterprise).
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: session,
        builder: (context, _) => MaterialApp(
          title: session.appName ?? 'SekolahApp',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(Brightness.light, brand: session.brandColor),
          darkTheme: buildTheme(Brightness.dark, brand: session.brandColor),
          locale: const Locale('id'),
          supportedLocales: const [Locale('id'), Locale('en')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: const AuthGate(),
        ),
      );
}

/// Menampilkan login atau aplikasi sesuai status masuk, dan memuat peran setelah login.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});
  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late final StreamSubscription<AuthState> _sub;

  @override
  void initState() {
    super.initState();
    session.addListener(_changed);
    _sub = sb.auth.onAuthStateChange.listen((s) {
      if (s.event == AuthChangeEvent.signedIn || s.event == AuthChangeEvent.initialSession) {
        if (s.session != null && session.profile == null) {
          session.load();
          Push.register();
        }
      }
      if (s.event == AuthChangeEvent.signedOut) setState(() {});
    });
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _sub.cancel();
    session.removeListener(_changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (sb.auth.currentSession == null) return const LoginScreen();
    if (session.profile == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (session.active == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const EmptyState('Akun Anda belum memiliki peran di sekolah mana pun. Hubungi admin sekolah.', icon: Icons.lock_outline),
              TextButton(onPressed: session.signOut, child: const Text('Keluar')),
            ]),
          ),
        ),
      );
    }
    return RoleShell(key: ValueKey(session.active!.key));
  }
}
