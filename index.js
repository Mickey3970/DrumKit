// --- Web Audio API Setup ---
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const soundFiles = {
  w: "sounds/tom-1.mp3",
  a: "sounds/tom-2.mp3",
  s: "sounds/tom-3.mp3",
  d: "sounds/tom-4.mp3",
  j: "sounds/snare.mp3",
  k: "sounds/crash.mp3",
  l: "sounds/kick-bass.mp3",
};
const audioBuffers = {};

async function loadSounds() {
  for (const key in soundFiles) {
    const response = await fetch(soundFiles[key]);
    const arrayBuffer = await response.arrayBuffer();
    audioBuffers[key] = await audioContext.decodeAudioData(arrayBuffer);
  }
}
loadSounds();
// --- End Web Audio API Setup ---

// Button click and keypress bindings
document.querySelectorAll(".drum").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.innerHTML;
    makeSound(key);
    buttonAnimation(key);
  });
});

document.addEventListener("keypress", function (event) {
  makeSound(event.key);
  buttonAnimation(event.key);
});

function makeSound(key) {
  playSound(key);
}

function buttonAnimation(currentKey) {
  const activeButton = document.querySelector("." + currentKey);
  if (!activeButton) return;
  activeButton.classList.add("pressed");
  setTimeout(() => activeButton.classList.remove("pressed"), 100);
}

// Recording setup
let isRecording = false;
let recordStartTime = 0;
let recordedNotes = [];

const recordBtn = document.getElementById("record");
const stopBtn = document.getElementById("stop");
const recordingIndicator = document.getElementById("recording-indicator");
const playBtn = document.getElementById("play");
const beatNameInput = document.getElementById("beatName");
const saveBeatBtn = document.getElementById("saveBeat");
const beatList = document.getElementById("beatList");
const loadBeatBtn = document.getElementById("loadBeat");
const deleteBeatBtn = document.getElementById("deleteBeat");
const bpmSlider = document.getElementById("bpmSlider");
const bpmValue = document.getElementById("bpmValue");
let bpm = 120;

// Share button setup
const shareBeatBtn = document.getElementById("shareBeat");

// --- LocalStorage Utils ---
function getAllBeats() {
  return JSON.parse(localStorage.getItem("drumkit-multibeats") || "{}");
}

function refreshBeatList() {
  const beats = getAllBeats();
  beatList.innerHTML = "";

  Object.keys(beats).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    beatList.appendChild(option);
  });

  loadBeatBtn.disabled = beatList.options.length === 0;
  deleteBeatBtn.disabled = beatList.options.length === 0;

  if (beatList.options.length > 0) {
    beatList.selectedIndex = 0;
  }
}
// --- End LocalStorage Utils ---

// Page load init
window.addEventListener("DOMContentLoaded", async function () {
  const params = new URLSearchParams(window.location.search);
  const beatId = params.get("beat");
  if (beatId) {
    const doc = await db.collection("beats").doc(beatId).get();
    if (doc.exists) {
      recordedNotes = doc.data().notes;
      playBtn.disabled = recordedNotes.length === 0;
      updateShareButton();
      alert("Loaded shared beat!");
    } else {
      alert("Shared beat not found.");
    }
  }
  refreshBeatList();
});

// Recording
recordBtn.addEventListener("click", function () {
  isRecording = true;
  recordedNotes = [];
  recordStartTime = Date.now();
  recordBtn.disabled = true;
  stopBtn.disabled = false;
  playBtn.disabled = true;

  // Show indicator and style
  recordingIndicator.style.display = "block";
  recordBtn.classList.add("recording");
});

stopBtn.addEventListener("click", function () {
  isRecording = false;
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  playBtn.disabled = recordedNotes.length === 0;

  // Hide indicator and style
  recordingIndicator.style.display = "none";
  recordBtn.classList.remove("recording");

  localStorage.setItem("drumkit-beats", JSON.stringify(recordedNotes));
  saveBeatBtn.disabled = !beatNameInput.value || recordedNotes.length === 0;
  updateShareButton();
});

// Save beat
beatNameInput.addEventListener("input", function () {
  saveBeatBtn.disabled = !beatNameInput.value || recordedNotes.length === 0;
});

saveBeatBtn.addEventListener("click", function () {
  const name = beatNameInput.value;
  if (!name) return;
  const beats = getAllBeats();
  beats[name] = recordedNotes;
  localStorage.setItem("drumkit-multibeats", JSON.stringify(beats));
  refreshBeatList();
  saveBeatBtn.disabled = true;
  beatNameInput.value = "";
});

// Load beat
loadBeatBtn.addEventListener("click", function () {
  const beats = getAllBeats();
  const selected = beatList.value;
  if (beats[selected]) {
    recordedNotes = beats[selected];
    playBtn.disabled = recordedNotes.length === 0;
    updateShareButton();
  }
});

// Delete beat
deleteBeatBtn.addEventListener("click", function () {
  const selected = beatList.value;
  if (!selected) return alert("Please select a beat to delete.");

  const confirmDelete = confirm(`Delete beat "${selected}"?`);
  if (!confirmDelete) return;

  const beats = getAllBeats();
  delete beats[selected];
  localStorage.setItem("drumkit-multibeats", JSON.stringify(beats));
  refreshBeatList();

  // If no beats left, clear recordedNotes and disable play button
  if (beatList.options.length === 0) {
    recordedNotes = [];
    playBtn.disabled = true;
    loadBeatBtn.disabled = true;
    deleteBeatBtn.disabled = true;
  } else {
    // Optionally, select the first beat after deletion
    beatList.selectedIndex = 0;
    loadBeatBtn.disabled = false;
    deleteBeatBtn.disabled = false;
  }

  alert(`Beat "${selected}" deleted.`);
});

// BPM control
bpmSlider.addEventListener("input", function () {
  bpm = parseInt(bpmSlider.value);
  bpmValue.textContent = bpm;

  if (isPlaying) {
    const elapsed = (Date.now() - playStartTime) / (120 / bpm);
    clearPlayTimeouts();
    playBeatFrom(playIndex, recordedNotes[playIndex - 1]?.time ?? 0 + elapsed);
  }
});

// Playback logic
let isPlaying = false;
let playStartTime = 0;
let playTimeouts = [];
let playIndex = 0;

function clearPlayTimeouts() {
  playTimeouts.forEach((id) => clearTimeout(id));
  playTimeouts = [];
}

function playBeatFrom(index = 0, offsetTime = 0) {
  if (recordedNotes.length === 0) return;
  isPlaying = true;
  playBtn.disabled = true;
  recordBtn.disabled = true;
  stopBtn.disabled = true;
  playIndex = index;
  playStartTime = Date.now() - offsetTime;

  const speedFactor = 120 / bpm;

  for (let i = index; i < recordedNotes.length; i++) {
    const note = recordedNotes[i];
    const delay = (note.time - offsetTime) * speedFactor;
    if (delay < 0) continue;
    const timeoutId = setTimeout(() => {
      makeSound(note.key);
      buttonAnimation(note.key);
      playIndex = i + 1;
      if (i === recordedNotes.length - 1) {
        isPlaying = false;
        playBtn.disabled = false;
        recordBtn.disabled = false;
      }
    }, delay);
    playTimeouts.push(timeoutId);
  }
}

playBtn.addEventListener("click", function () {
  if (recordedNotes.length === 0) return;
  clearPlayTimeouts();
  playBeatFrom();
});

// Enhanced Visualizer Setup
const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");
const analyser = audioContext.createAnalyser();

// Increased FFT size for more bars and better frequency resolution
analyser.fftSize = 256;
analyser.smoothingTimeConstant = 0.85;
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);
analyser.connect(audioContext.destination);

// Variables for enhanced visualization
let previousDataArray = new Uint8Array(bufferLength);
let smoothedDataArray = new Uint8Array(bufferLength);
let peakArray = new Uint8Array(bufferLength);
let peakFallRate = 3;

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  analyser.getByteFrequencyData(dataArray);

  // Canvas setup
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create purple/magenta gradient matching your reference
  const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
  gradient.addColorStop(0, "#8B00FF"); // Deep purple at bottom
  gradient.addColorStop(0.3, "#CC00FF"); // Bright magenta
  gradient.addColorStop(0.7, "#FF00CC"); // Pink-magenta
  gradient.addColorStop(1, "#FF66DD"); // Light pink at top

  // Enhanced bar calculation
  const totalBars = 64; // More bars for better visual density
  const barWidth = Math.max(
    2,
    (canvas.width - (totalBars - 1) * 2) / totalBars
  );
  const startX =
    (canvas.width - (totalBars * barWidth + (totalBars - 1) * 2)) / 2;

  // Process audio data for more dynamic visualization
  for (let i = 0; i < totalBars; i++) {
    // Map bars to frequency data with emphasis on different ranges
    const dataIndex = Math.floor((i / totalBars) * bufferLength);
    let barHeight = dataArray[dataIndex];

    // Apply different scaling for different frequency ranges
    if (i < totalBars * 0.2) {
      // Bass frequencies - emphasize more
      barHeight = Math.min(255, barHeight * 1.4);
    } else if (i < totalBars * 0.6) {
      // Mid frequencies - normal scaling
      barHeight = barHeight * 1.2;
    } else {
      // High frequencies - slightly reduced
      barHeight = barHeight * 0.9;
    }

    // Smooth the data for less jittery movement
    smoothedDataArray[i] = smoothedDataArray[i] * 0.7 + barHeight * 0.3;

    // Peak detection for more dynamic visualization
    if (smoothedDataArray[i] > peakArray[i]) {
      peakArray[i] = smoothedDataArray[i];
    } else {
      peakArray[i] = Math.max(0, peakArray[i] - peakFallRate);
    }

    // Add some variation to make it more interesting
    const variation = Math.sin(Date.now() * 0.01 + i * 0.5) * 10;
    const finalHeight = Math.max(
      4,
      ((peakArray[i] + variation) / 255) * canvas.height * 0.85
    );

    // Calculate position
    const x = startX + i * (barWidth + 2);
    const y = canvas.height - finalHeight;

    // Draw bar with glow effect
    ctx.save();

    // Glow effect
    ctx.shadowColor = "#FF00FF";
    ctx.shadowBlur = 15;
    ctx.globalAlpha = 0.8;

    // Main bar
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, finalHeight);

    // Add highlight for more depth
    if (finalHeight > 20) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(x, y, barWidth * 0.3, finalHeight * 0.6);
    }

    ctx.restore();
  }

  // Store current data for next frame
  previousDataArray.set(dataArray);
}

// Initialize visualizer
drawVisualizer();

function playSound(key) {
  if (audioBuffers[key]) {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[key];
    source.connect(analyser);
    source.start(0);

    // Record the note if recording
    if (isRecording) {
      recordedNotes.push({
        key: key,
        time: Date.now() - recordStartTime,
      });
    }
  }
}

// Enable Share button when a beat is loaded or recorded
function updateShareButton() {
  shareBeatBtn.disabled = recordedNotes.length === 0;
}

// Call updateShareButton() wherever you update recordedNotes

shareBeatBtn.addEventListener("click", async function () {
  if (!recordedNotes.length) return alert("No beat to share!");
  // Save beat to Firestore
  const docRef = await db.collection("beats").add({
    notes: recordedNotes,
    created: new Date().toISOString(),
  });
  // Generate shareable URL
  const url = `${window.location.origin}${window.location.pathname}?beat=${docRef.id}`;
  prompt("Share this URL:", url);
});
