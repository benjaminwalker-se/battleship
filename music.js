(function () {
  const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const BEAT = 0.1875; // 160 bpm, eighth-note grid

  function freq(note) {
    if (note === "-") return 0;
    const m = /^([A-G])(#?)(-?\d)$/.exec(note);
    const semitone = SEMITONES[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
    return 440 * Math.pow(2, (semitone - 69) / 12);
  }

  // Original NES-style naval march: minor-key fanfare over a marching bass.
  const LEAD = [
    ["D5", 2], ["D5", 1], ["A4", 1], ["D5", 2], ["F5", 2],
    ["E5", 3], ["D5", 1], ["C5", 2], ["A4", 2],
    ["A#4", 2], ["A#4", 1], ["F4", 1], ["A#4", 2], ["D5", 2],
    ["C5", 3], ["A#4", 1], ["A4", 4],
    ["D5", 2], ["F5", 1], ["A5", 1], ["G5", 2], ["F5", 2],
    ["E5", 2], ["D5", 1], ["E5", 1], ["F5", 4],
    ["G5", 2], ["F5", 1], ["E5", 1], ["D5", 2], ["C5", 2],
    ["A4", 3], ["C5", 1], ["D5", 4],
  ];

  const HARMONY = [
    ["A4", 2], ["A4", 1], ["F4", 1], ["A4", 2], ["D5", 2],
    ["C5", 3], ["A4", 1], ["G4", 2], ["F4", 2],
    ["F4", 2], ["F4", 1], ["D4", 1], ["F4", 2], ["A#4", 2],
    ["A4", 3], ["G4", 1], ["F4", 4],
    ["A4", 2], ["D5", 1], ["F5", 1], ["E5", 2], ["D5", 2],
    ["C5", 2], ["A4", 1], ["C5", 1], ["D5", 4],
    ["E5", 2], ["D5", 1], ["C5", 1], ["A4", 2], ["G4", 2],
    ["F4", 3], ["A4", 1], ["A4", 4],
  ];

  const BASS = [
    ["D3", 2], ["D2", 2], ["A2", 2], ["D2", 2],
    ["F3", 2], ["F2", 2], ["C3", 2], ["C2", 2],
    ["A#2", 2], ["A#2", 2], ["F3", 2], ["F2", 2],
    ["C3", 2], ["C2", 2], ["D3", 2], ["D2", 2],
    ["D3", 2], ["D2", 2], ["A2", 2], ["A2", 2],
    ["A#2", 2], ["A#2", 2], ["F3", 2], ["F2", 2],
    ["G2", 2], ["G2", 2], ["A2", 2], ["A2", 2],
    ["D3", 2], ["A2", 2], ["D3", 2], ["D2", 2],
  ];

  const totalBeats = (track) => track.reduce((sum, n) => sum + n[1], 0);
  const LOOP = totalBeats(LEAD) * BEAT;

  let ctx = null;
  let master = null;
  let timer = null;
  let nextLoopAt = null;
  let playing = false;
  let loopsScheduled = 0;
  let volume = 0.35;

  function ensureContext() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }

  function playTone(audio, dest, note, start, beats, { type, gain, duty }) {
    if (note === "-") return;
    const dur = beats * BEAT;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = type;
    if (duty && type === "square") osc.detune.value = duty;
    osc.frequency.setValueAtTime(freq(note), start);
    // Blunt attack, quick decay: the shape of a NES pulse channel.
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.008);
    env.gain.setTargetAtTime(gain * 0.6, start + 0.01, 0.12);
    env.gain.setTargetAtTime(0.0001, start + dur * 0.85, 0.03);
    osc.connect(env).connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.06);
  }

  function playTrack(audio, dest, track, start, opts) {
    let t = start;
    for (const [note, beats] of track) {
      playTone(audio, dest, note, t, beats, opts);
      t += beats * BEAT;
    }
  }

  function playDrums(audio, dest, start) {
    for (let beat = 0; beat < totalBeats(BASS); beat += 2) {
      const t = start + beat * BEAT;
      const noise = audio.createBufferSource();
      const len = Math.floor(audio.sampleRate * 0.06);
      const buffer = audio.createBuffer(1, len, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      noise.buffer = buffer;
      const env = audio.createGain();
      env.gain.value = beat % 8 === 4 ? 0.12 : 0.05;
      noise.connect(env).connect(dest);
      noise.start(t);
    }
  }

  function scheduleLoop(audio, dest, start) {
    playTrack(audio, dest, LEAD, start, { type: "square", gain: 0.12 });
    playTrack(audio, dest, HARMONY, start, { type: "square", gain: 0.06, duty: 6 });
    playTrack(audio, dest, BASS, start, { type: "triangle", gain: 0.18 });
    playDrums(audio, dest, start);
  }

  // Debug hook: render one loop offline and report its peak amplitude.
  async function render() {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const audio = new Offline(1, Math.ceil(44100 * LOOP), 44100);
    scheduleLoop(audio, audio.destination, 0);
    const buffer = await audio.startRendering();
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    return { seconds: LOOP, peak };
  }

  function pump() {
    if (!playing) return;
    while (nextLoopAt < ctx.currentTime + LOOP) {
      scheduleLoop(ctx, master, nextLoopAt);
      nextLoopAt += LOOP;
      loopsScheduled += 1;
    }
  }

  // Suspending freezes ctx.currentTime, so the scheduling timeline survives a
  // pause: resuming continues it rather than laying a second loop over the
  // sources that are still scheduled.
  function play() {
    if (playing) return;
    ensureContext();
    playing = true;
    ctx.resume();
    if (nextLoopAt === null) nextLoopAt = ctx.currentTime + 0.1;
    pump();
    if (timer === null) timer = setInterval(pump, (LOOP * 1000) / 2);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    timer = null;
    ctx.suspend();
  }

  function setVolume(value) {
    volume = Math.min(1, Math.max(0, value));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    try {
      localStorage.setItem("battleship.volume", String(volume));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function build() {
    try {
      const raw = localStorage.getItem("battleship.volume");
      const stored = Number(raw);
      if (raw !== null && Number.isFinite(stored) && stored >= 0 && stored <= 1) volume = stored;
    } catch (e) {
      /* storage unavailable */
    }

    const wrap = document.createElement("div");
    wrap.id = "music";
    wrap.innerHTML = `
      <button id="musicToggle" aria-pressed="false" title="Play theme music">▶ Theme</button>
      <label id="musicVol">
        <span>Volume</span>
        <input id="musicVolume" type="range" min="0" max="100" step="1" aria-label="Music volume" />
      </label>
    `;
    document.querySelector("header").appendChild(wrap);

    const toggle = wrap.querySelector("#musicToggle");
    const slider = wrap.querySelector("#musicVolume");
    slider.value = String(Math.round(volume * 100));

    toggle.addEventListener("click", () => {
      if (playing) pause();
      else play();
      toggle.textContent = playing ? "❚❚ Theme" : "▶ Theme";
      toggle.setAttribute("aria-pressed", String(playing));
      toggle.title = playing ? "Pause theme music" : "Play theme music";
    });

    slider.addEventListener("input", () => setVolume(Number(slider.value) / 100));
  }

  window.Music = { play, pause, setVolume, isPlaying: () => playing, context: () => ctx, render,
    stats: () => ({ playing, loopsScheduled, nextLoopAt, state: ctx && ctx.state, now: ctx && ctx.currentTime }) };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
