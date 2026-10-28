import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'supa.dart';

class ClassRef {
  ClassRef(this.id, this.name, {this.homeroomTeacherId, this.homeroom = false});
  final String id;
  final String name;
  final String? homeroomTeacherId;
  final bool homeroom;
}

class StudentRef {
  StudentRef(this.id, this.fullName, {this.nis, this.relation, this.klass});
  final String id;
  final String fullName;
  final String? nis;
  final String? relation;
  final ClassRef? klass;
}

ClassRef? _activeClass(List? enrollments) {
  final e = (enrollments ?? []).cast<Map>().where((e) => e['classes']?['academic_years']?['is_active'] == true).firstOrNull;
  if (e == null) return null;
  final c = e['classes'] as Map;
  return ClassRef(c['id'] as String, c['name'] as String, homeroomTeacherId: c['homeroom_teacher_id'] as String?);
}

/// Data murid milik akun murid ini beserta kelas aktifnya.
Future<StudentRef?> myStudent(String userId, String schoolId) async {
  final row = await sb.from('students')
      .select('id, full_name, nis, enrollments(classes!inner(id, name, homeroom_teacher_id, academic_years!inner(is_active)))')
      .eq('user_id', userId).eq('school_id', schoolId).maybeSingle();
  if (row == null) return null;
  return StudentRef(row['id'], row['full_name'], nis: row['nis'], klass: _activeClass(row['enrollments'] as List?));
}

/// Anak-anak milik akun orang tua di sekolah ini.
Future<List<StudentRef>> myChildren(String userId, String schoolId) async {
  final rows = await sb.from('guardian_links')
      .select('relation, students!inner(id, full_name, nis, enrollments(classes!inner(id, name, homeroom_teacher_id, academic_years!inner(is_active))))')
      .eq('guardian_id', userId).eq('school_id', schoolId);
  final list = rows.map((g) {
    final s = g['students'] as Map;
    return StudentRef(s['id'], s['full_name'], nis: s['nis'], relation: g['relation'], klass: _activeClass(s['enrollments'] as List?));
  }).toList()
    ..sort((a, b) => a.fullName.compareTo(b.fullName));
  return list;
}

/// Kelas yang diajar atau diwalikan guru (tahun ajaran aktif).
Future<List<ClassRef>> myClasses(String teacherId, String schoolId) async {
  final results = await Future.wait([
    sb.from('teaching_assignments').select('classes!inner(id, name, academic_years!inner(is_active))')
        .eq('teacher_id', teacherId).eq('classes.academic_years.is_active', true),
    sb.from('classes').select('id, name, academic_years!inner(is_active)')
        .eq('homeroom_teacher_id', teacherId).eq('school_id', schoolId).eq('academic_years.is_active', true),
  ]);
  final map = <String, ClassRef>{};
  for (final c in results[1]) {
    map[c['id']] = ClassRef(c['id'], c['name'], homeroom: true);
  }
  for (final t in results[0]) {
    final c = t['classes'] as Map;
    map.putIfAbsent(c['id'], () => ClassRef(c['id'], c['name']));
  }
  return map.values.toList()..sort((a, b) => a.name.compareTo(b.name));
}

Future<List<Map<String, dynamic>>> classRoster(String classId) async {
  final rows = await sb.from('enrollments').select('roll_number, students!inner(id, full_name, nis)')
      .eq('class_id', classId).order('roll_number', ascending: true, nullsFirst: false);
  return rows.map((e) => {'roll': e['roll_number'], ...(e['students'] as Map<String, dynamic>)}).toList();
}

Future<String?> signedUrl(String bucket, String? path) async {
  if (path == null) return null;
  try {
    return await sb.storage.from(bucket).createSignedUrl(path, 60 * 30);
  } catch (_) {
    return null;
  }
}

/// Berkas yang dipilih pengguna, siap diunggah.
class PickedFile {
  PickedFile(this.name, this.bytes, this.mime);
  final String name;
  final Uint8List bytes;
  final String mime;
}

const _mimes = {
  'pdf': 'application/pdf', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
  'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

Future<PickedFile?> pickFile({List<String> extensions = const ['pdf', 'jpg', 'jpeg', 'png'], int maxMb = 5}) async {
  final f = (await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: extensions)).firstOrNull;
  if (f == null) return null;
  if ((await f.length() ?? 0) > maxMb * 1024 * 1024) throw AppError('Ukuran berkas maksimal $maxMb MB');
  final ext = (f.extension ?? '').replaceFirst('.', '').toLowerCase();
  return PickedFile(f.name, await f.readAsBytes(), _mimes[ext] ?? 'application/octet-stream');
}

/// Unggah ke Storage di `folder/<waktu>-<nama>`; struktur folder mengikuti kebijakan RLS bucket.
Future<String> upload(String bucket, String folder, PickedFile f) async {
  final safe = f.name.replaceAll(RegExp(r'[^\w.\-]+'), '_');
  final path = '$folder/${DateTime.now().millisecondsSinceEpoch}-${safe.length > 80 ? safe.substring(safe.length - 80) : safe}';
  await guard(() => sb.storage.from(bucket).uploadBinary(path, f.bytes, fileOptions: FileOptions(contentType: f.mime)));
  return path;
}
