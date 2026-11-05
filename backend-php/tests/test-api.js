// Uji end-to-end REST API. Server PHP harus jalan + database sudah diimpor.
// Default http://localhost:8000; override: API_BASE=http://host:port node tests/test-api.js
const B = process.env.API_BASE || 'http://localhost:8000';
async function call(method, path, token, body) {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(method + ' ' + path + ' -> ' + (d.error || r.status));
  return d;
}
(async () => {
  try {
    const guru = await call('POST', '/api/login', null, { email: 'guru@smk.sch.id', password: 'password123' });
  console.log('1 login guru OK:', guru.user.nama, guru.user.role);
  const mods = await call('GET', '/api/modules', guru.token);
  console.log('2 modules:', mods.map(m => 'Lv' + m.level + ' ' + m.judul).join(' | '));
  const siswa = await call('POST', '/api/login', null, { email: 'andi@murid.sch.id', password: 'password123' });
  console.log('3 login siswa OK:', siswa.user.nama);
  const att = await call('POST', '/api/attempts', siswa.token, { modul_id: mods[1].id, gcode: mods[1].starter_gcode });
  console.log('4 attempt tersimpan: skor=' + att.skor, 'match=' + att.match, 'err=' + att.ada_error);
  const bad = await call('POST', '/api/attempts', siswa.token, { modul_id: mods[1].id, gcode: 'G01 X20 Z-40\nG00 X10 Z-20' });
  console.log('5 attempt salah: skor=' + bad.skor, 'err=' + bad.ada_error);
  const tutor = await call('POST', '/api/ai-tutor', siswa.token, { gcode: 'G01 X20 Z-40', modul_id: mods[1].id });
  console.log('6 ai-tutor source=' + tutor.source, 'skor=' + tutor.skor);
  tutor.feedback.slice(0, 3).forEach(f => console.log('   -', String(f).slice(0, 110)));
  console.log('   rekomendasi:', tutor.rekomendasi ? 'Lv' + tutor.rekomendasi.level + ' ' + tutor.rekomendasi.judul : '-');
  const prog = await call('POST', '/api/programs', siswa.token, { nama: 'O0001 - Tirus', gcode: 'G90\nG00 X40 Z0' });
  console.log('7 program tersimpan:', prog.nama);
  const renamed = await call('PUT', '/api/programs/' + prog.id, siswa.token, { nama: 'O0001 - Tirus Revisi' });
  console.log('8 rename OK:', renamed.nama);
  await call('DELETE', '/api/programs/' + prog.id, siswa.token);
  console.log('9 hapus program OK');
  const hist = await call('GET', '/api/attempts', siswa.token);
  console.log('10 riwayat siswa:', hist.length + ' percobaan');
  const dash = await call('GET', '/api/progress', guru.token);
  console.log('11 progress guru:', dash.map(d => d.siswa.nama + ' tuntas ' + d.modul.filter(m => m.tuntas).length + '/' + d.modul.length).join(' | '));
  console.log('SEMUA UJI LOLOS');
  } catch (e) { console.error('GAGAL:', e.message); process.exit(1); }
})();
