// =============================================================
// CncBotWidget.jsx — maskot AI mengambang di pojok kanan bawah.
// Tampil untuk siswa (CNC-Bot - mentor Sokratik) dan guru (CNC-TeacherBot - asisten KBM).
// Ukuran maskot proporsional mengikuti model AI (bukan lingkaran kaku).
// =============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import Icon from '../ui/Icon.jsx';
import studentMascot from '../assets/cncbot-character.png';
import teacherMascot from '../assets/teacherbot-character.png';
import studentAvatar from '../assets/cncbot-avatar.jpg';

const SISWA_GREETINGS = [
  'Halo {nama}! Ada kode G-Code yang ingin dibahas bareng CNC-Bot?',
  'Hai {nama}! Siap latihan bubut CNC hari ini?',
  'Halo {nama}! Bingung arah koordinat X/Z? Yuk tanya CNC-Bot!',
  'Hai {nama}! CNC-Bot siap bantu kamu memahami jalur pahat!',
];

const GURU_GREETINGS = [
  'Selamat datang Bapak/Ibu {nama}! Ada tugas atau kuis CNC yang ingin disiapkan hari ini?',
  'Halo Bapak/Ibu {nama}! Butuh ide tugas praktik bubut CNC atau rubrik penilaian?',
  'Halo Bapak/Ibu {nama}! CNC-TeacherBot siap membantu perancangan materi & evaluasi KBM.',
];

const SISWA_CHIPS = [
  'Apa beda G00 dan G01?',
  'Kenapa pahat tabrakan saat mundur?',
  'Bagaimana menentukan koordinat X diameter?',
];

const GURU_CHIPS = [
  'Buatkan ide tugas praktik bubut tirus',
  'Buat 3 soal kuis pilihan ganda G02/G03 beserta kunci',
  'Rumus kecepatan potong Vc dan RPM spindel',
  'Kriteria rubrik penilaian tugas praktik bubut',
];

function pickGreeting(nama, isGuru) {
  const list = isGuru ? GURU_GREETINGS : SISWA_GREETINGS;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx].replace('{nama}', nama || (isGuru ? 'Guru' : 'kamu'));
}

export default function CncBotWidget() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const shownRef = useRef(false);

  const isGuru = user?.role === 'guru';
  const isSiswa = user?.role === 'siswa';

  // Hanya tampil untuk siswa atau guru
  if (!user || (!isSiswa && !isGuru)) return null;

  const botName = isGuru ? 'Asisten Guru CNC' : 'CNC-Bot';
  const botSub = isGuru ? 'Partner KBM & Penyusun Tugas' : 'Mentor Belajar CNC';
  const mascotImg = isGuru ? teacherMascot : studentMascot;
  const chips = isGuru ? GURU_CHIPS : SISWA_CHIPS;

  // Sapaan pertama kali muncul setelah 1.2 detik
  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    const timer = setTimeout(() => {
      const shortName = user.nama?.split(' ')[0] || user.nama;
      const greeting = pickGreeting(shortName, isGuru);
      setBubble(greeting);
      setMessages([{ role: 'bot', text: greeting }]);
    }, 1200);
    return () => clearTimeout(timer);
  }, [user.nama, isGuru]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const toggleChat = useCallback(() => {
    setOpen((o) => !o);
    setDismissed(true);
  }, []);

  const dismissBubble = useCallback((e) => {
    e.stopPropagation();
    setDismissed(true);
  }, []);

  const handleSendText = useCallback(async (textToSend) => {
    const text = (textToSend ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const r = await api('/api/ai-tutor', {
        method: 'POST',
        body: JSON.stringify({ gcode: text, modul_id: null }),
      });
      const botReply = r.feedback?.join('\n\n') || (
        isGuru
          ? 'Baik Bapak/Ibu Guru, ada aspek teknis lain yang perlu kita kaji bersama?'
          : 'Hmm, CNC-Bot belum bisa menjawab itu. Coba tanyakan seputar kode G-Code atau bubut CNC!'
      );
      setMessages((prev) => [...prev, { role: 'bot', text: botReply }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'bot', text: `Maaf, terjadi kendala koneksi: ${e.message}` }]);
    }
    setLoading(false);
  }, [input, loading, isGuru]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  }, [handleSendText]);

  return (
    <div className={`cncbot${isGuru ? ' cncbot--guru' : ''}`}>
      {/* Bubble chat sapaan */}
      {bubble && !dismissed && !open && (
        <div className="cncbot__bubble" onClick={toggleChat} role="button" tabIndex={0}>
          <button className="cncbot__bubble-close" onClick={dismissBubble} title="Tutup sapaan">
            <Icon name="close" size={11} />
          </button>
          <span>{bubble}</span>
        </div>
      )}

      {/* Panel chat */}
      {open && (
        <div className="cncbot__panel">
          <div className="cncbot__header">
            <img
              src={studentAvatar || mascotImg}
              alt={botName}
              className="cncbot__header-avatar"
            />
            <div>
              <b>{botName}</b>
              <span>{botSub}</span>
            </div>
            <button className="cncbot__close" onClick={toggleChat} title="Tutup chat">
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="cncbot__messages">
            {messages.map((m, i) => (
              <div key={i} className={`cncbot__msg cncbot__msg--${m.role}`}>
                {m.role === 'bot' && (
                  <img
                    src={studentAvatar || mascotImg}
                    alt="Bot"
                    className="cncbot__msg-avatar"
                  />
                )}
                <div className="cncbot__msg-text">{m.text}</div>
              </div>
            ))}
            {loading && (
              <div className="cncbot__msg cncbot__msg--bot">
                <img
                  src={studentAvatar || mascotImg}
                  alt="Bot"
                  className="cncbot__msg-avatar"
                />
                <div className="cncbot__msg-text cncbot__typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick chips saran pertanyaan */}
          <div className="cncbot__chips">
            {chips.map((c, i) => (
              <button
                key={i}
                type="button"
                className="cncbot__chip"
                onClick={() => handleSendText(c)}
                disabled={loading}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="cncbot__input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isGuru
                  ? 'Tanya ide tugas, draf soal kuis, rumus pemesinan, atau analisis G-Code...'
                  : 'Ketik G-Code atau pertanyaan seputar bubut CNC...'
              }
              rows={2}
            />
            <button
              className="cncbot__send"
              onClick={() => handleSendText()}
              disabled={!input.trim() || loading}
              title="Kirim pesan"
            >
              <Icon name="send" size={16} />
            </button>
          </div>

          <div className="cncbot__footer">
            <span>
              {isGuru
                ? 'CNC-TeacherBot siap menyusun soal kuis, panduan modul praktik, dan rubrik penilaian.'
                : 'CNC-Bot membimbing dengan metode Sokratik: memberi pemantik berpikir, bukan jawaban instan.'}
            </span>
          </div>
        </div>
      )}

      {/* Tombol Maskot Mengambang (Ukuran proporsional sesuai model karakter AI) */}
      <button
        className={`cncbot__mascot-btn${open ? ' is-open' : ''}`}
        onClick={toggleChat}
        title={isGuru ? 'Buka Asisten Guru CNC' : 'Tanya CNC-Bot'}
        aria-label={botName}
      >
        <img
          src={mascotImg}
          alt={botName}
          className="cncbot__mascot-img"
        />
        <div className="cncbot__mascot-badge">
          <span className="cncbot__dot" />
          <span>{botName}</span>
        </div>
        {open && (
          <span className="cncbot__mascot-close" title="Tutup">
            <Icon name="close" size={12} />
          </span>
        )}
      </button>
    </div>
  );
}
