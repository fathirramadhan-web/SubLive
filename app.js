const $ = id => document.getElementById(id);
const status = t => { $('status').textContent = t; };
const worker = new Worker('worker.js', { type: 'module' });
const SR = 16000, WIN = 8; // detik audio per kiriman ke worker

let mode = null, fileURL = null, running = false, busy = false, queue = [];
let cues = [], pending = null, capUntil = 0, micCtx = null, micStream = null, proc = null, micBuf = [], micSamples = 0, jobSeq = 0;
let tabCtx = null, tabStream = null;
let modelReady = false;

worker.onmessage = e => {
  const m = e.data;
  if (m.type === 'progress') {
    if (m.p.status === 'progress' && m.p.total) status(`Unduh model ${m.p.file || ''}: ${Math.round(100 * m.p.loaded / m.p.total)}%`);
    else if (m.p.status === 'done') status('Menyiapkan model...');
  } else if (m.type === 'loaded') {
    modelReady = true;
    status(`Model siap (${m.device || 'wasm'}).`);
    $('startFile').disabled = false;
    $('startTab').disabled = false;
    $('startMic').disabled = false;
  } else if (m.type === 'result') {
    busy = false;
    if (m.id === pending?.id) {
      const base = pending.base;
      for (const c of m.chunks) addCue(base + c.start, base + c.end, c.text);
      pending = null;
    }
    pump();
  } else if (m.type === 'error') {
    busy = false; pending = null;
    status('Error: ' + m.message);
    stop();
  }
};

function pump() {
  if (busy || !queue.length || !running) return;
  busy = true;
  pending = queue.shift();
  worker.postMessage({ type: 'transcribe', id: pending.id, audio: pending.audio, language: $('lang').value }, [pending.audio.buffer]);
}

function addCue(start, end, text) {
  cues.push({ start, end, text });
  $('transcript').textContent += text + '\n';
  $('transcript').scrollTop = 1e9;
  $('export').disabled = false;
  $('capText').textContent = text;
  $('cap').style.display = 'flex';
  capUntil = performance.now() + 6000;
}

function tick() {
  requestAnimationFrame(tick);
  const v = $('player');
  if (mode === 'file' && !v.paused) {
    const t = v.currentTime;
    let show = null;
    for (let i = cues.length - 1; i >= 0 && cues[i].start > t - 12; i--) {
      const c = cues[i];
      if (t >= c.start && t < c.end) { show = c.text; break; }
    }
    if (show) { $('capText').textContent = show; $('cap').style.display = 'flex'; }
    else $('cap').style.display = 'none';
  } else if (mode === 'tab' || mode === 'mic') {
    if (performance.now() > capUntil) $('cap').style.display = 'none';
  }
}
tick();

$('loadModel').onclick = () => {
  $('loadModel').disabled = true;
  status('Memuat model... unduhan pertama butuh internet.');
  worker.postMessage({ type: 'load', model: $('model').value });
};

$('file').onchange = () => {
  const f = $('file').files[0];
  if (!f) return;
  if (fileURL) URL.revokeObjectURL(fileURL);
  fileURL = URL.createObjectURL(f);
  const v = $('player');
  v.src = fileURL;
  v.style.display = 'block';
};

async function decodeTo16k(arrayBuffer) {
  const ctx = new AudioContext({ sampleRate: SR });
  try {
    const buf = await ctx.decodeAudioData(arrayBuffer);
    const n = buf.length, mono = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    return mono;
  } finally { ctx.close(); }
}

$('startFile').onclick = async () => {
  const f = $('file').files[0];
  if (!f) { status('Pilih file dulu.'); return; }
  if (!modelReady) { status('Muat model dulu.'); return; }
  stop();
  mode = 'file'; running = true; $('stop').disabled = false;
  cues = []; $('transcript').textContent = '';
  status('Mendekode audio...');
  try {
    const mono = await decodeTo16k(await f.arrayBuffer());
    for (let s = 0; s * SR < mono.length; s += WIN) {
      queue.push({ id: ++jobSeq, base: s, audio: mono.slice(s * SR, (s + WIN) * SR) });
    }
    status(`Transkrip berjalan, ${queue.length} potongan. Putar video, subtitle muncul saat bagiannya selesai diproses.`);
    pump();
  } catch (err) {
    status('Gagal dekode audio: ' + err.message + '. Coba file mp4/mp3/webm/wav.');
    stop();
  }
};

$('startTab').onclick = async () => {
  if (!modelReady) { status('Muat model dulu.'); return; }
  stop();
  try {
    // ponytail: Chrome tampilkan video sendiri di picker; pakai video track agar bisa share tab.
    tabStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 2, height: 2 },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: SR }
    });
  } catch (e) {
    status('Tidak bisa ambil audio tab: ' + (e.name === 'NotAllowedError' ? 'izin ditolak' : e.message) + '. Di HP: saat share, aktifkan "Bagikan suara".');
    return;
  }
  if (!tabStream.getAudioTracks().length) {
    status('Tidak ada audio tab. Saat share, centang "Bagikan suara".');
    tabStream.getTracks().forEach(t => t.stop());
    return;
  }
  tabStream.getVideoTracks().forEach(t => t.stop()); // suara saja
  mode = 'tab'; running = true; $('stop').disabled = false;
  cues = []; $('transcript').textContent = '';
  tabCtx = new AudioContext({ sampleRate: SR });
  const srcNode = tabCtx.createMediaStreamSource(tabStream);
  proc = tabCtx.createScriptProcessor(4096, 1, 1);
  micBuf = []; micSamples = 0;
  proc.onaudioprocess = e => {
    if (!running) return;
    const d = e.inputBuffer.getChannelData(0);
    micBuf.push(new Float32Array(d));
    micSamples += d.length;
    if (micSamples >= WIN * SR) {
      const all = new Float32Array(micSamples);
      let o = 0;
      for (const b of micBuf) { all.set(b, o); o += b.length; }
      micBuf = []; micSamples = 0;
      queue.push({ id: ++jobSeq, base: 0, audio: all });
      pump();
    }
  };
  srcNode.connect(proc);
  status('Menangkap suara tab. Putar video di tab ini. Teks muncul tiap ~8 detik + waktu proses.');
  tabStream.getAudioTracks()[0].addEventListener('ended', () => { if (mode === 'tab') { stop(); status('Berbagi tab berakhir.'); } });
};

$('startMic').onclick = async () => {
  if (!modelReady) { status('Muat model dulu.'); return; }
  stop();
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
  } catch {
    status('Akses mikrofon ditolak. Izinkan mikrofon di browser.');
    return;
  }
  mode = 'mic'; running = true; $('stop').disabled = false;
  cues = []; $('transcript').textContent = '';
  micCtx = new AudioContext({ sampleRate: SR });
  const srcNode = micCtx.createMediaStreamSource(micStream);
  proc = micCtx.createScriptProcessor(4096, 1, 1);
  micBuf = []; micSamples = 0;
  proc.onaudioprocess = e => {
    if (!running) return;
    const d = e.inputBuffer.getChannelData(0);
    micBuf.push(new Float32Array(d));
    micSamples += d.length;
    if (micSamples >= WIN * SR) {
      const all = new Float32Array(micSamples);
      let o = 0;
      for (const b of micBuf) { all.set(b, o); o += b.length; }
      micBuf = []; micSamples = 0;
      queue.push({ id: ++jobSeq, base: 0, audio: all });
      pump();
    }
  };
  srcNode.connect(proc);
  proc.connect(micCtx.destination);
  status('Mendengarkan... arahkan suara ke mikrofon (speaker HP boleh). Teks tampil tiap ~8 detik + waktu proses.');
};

function stop() {
  running = false; busy = false; queue = []; pending = null;
  $('stop').disabled = true;
  $('cap').style.display = 'none';
  if (proc) { proc.disconnect(); proc.onaudioprocess = null; proc = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (micCtx) { micCtx.close().catch(() => {}); micCtx = null; }
  if (tabStream) { tabStream.getTracks().forEach(t => t.stop()); tabStream = null; }
  if (tabCtx) { tabCtx.close().catch(() => {}); tabCtx = null; }
  mode = null;
}
$('stop').onclick = () => { stop(); status('Berhenti.'); };

$('export').onclick = () => {
  const ts = s => {
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s) % 60, ms = Math.round((s % 1) * 1000);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
  };
  const srt = cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([srt], { type: 'text/plain' }));
  a.download = 'sublive.srt';
  a.click();
  URL.revokeObjectURL(a.href);
};

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

// Fullscreen: saat mode file, fullscreen-kan player dan taruh caption di dalamnya.
// Mode lain, fullscreen-kan halaman (caption sudah fixed di bawah).
const capEl = $('cap');
const isInFs = () => !!document.fullscreenElement;
function requestFs(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  return fn ? fn.call(el).catch(() => {}) : Promise.resolve();
}
$('fs').onclick = () => {
  if (isInFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const v = $('player');
  const useVideo = !!v.src;
  requestFs(useVideo ? v : document.documentElement).then(() => {
    if (useVideo && document.fullscreenElement === v) v.appendChild(capEl);
  });
};
document.addEventListener('fullscreenchange', () => {
  if (!isInFs()) document.body.appendChild(capEl);
  $('fs').textContent = isInFs() ? 'Keluar layar penuh' : 'Layar penuh';
});