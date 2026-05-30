// Head tracking pela webcam (MediaPipe FaceLandmarker).
// Posicao da cabeca no quadro -> yaw/pitch (olhar em volta), com suavizacao e calibracao.
import { FaceLandmarker, FilesetResolver } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

export function createFaceTrack({ gain = 2.6, onLook, onStatus } = {}) {
  let landmarker = null, video = null, stream = null, running = false, raf = 0;
  let baseX = 0.5, baseY = 0.5;        // baseline (recenter)
  let sx = 0, sy = 0;                   // suavizado
  let lastVideoTime = -1;

  async function start() {
    onStatus && onStatus('carregando modelo de rosto…');
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
    });

    onStatus && onStatus('pedindo câmera…');
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
    video = document.createElement('video');
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    await video.play();

    running = true;
    onStatus && onStatus('rosto: olhe pra frente e tecle R p/ centralizar');
    loop();
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!landmarker || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    let res;
    try { res = landmarker.detectForVideo(video, performance.now()); } catch { return; }
    const lm = res && res.faceLandmarks && res.faceLandmarks[0];
    if (!lm) return;

    // nariz (1) como referencia de posicao da cabeca
    const nose = lm[1];
    const nx = nose.x;
    const ny = nose.y;

    // suavizacao (low-pass) — menor = mais suave
    sx += (nx - sx) * 0.15;
    sy += (ny - sy) * 0.15;

    const yaw = (sx - baseX) * gain * Math.PI;     // esquerda/direita
    const pitch = -(sy - baseY) * gain * Math.PI;  // cima/baixo
    onLook && onLook(yaw, pitch);
  }

  function calibrate() { baseX = sx; baseY = sy; onStatus && onStatus('rosto centralizado ✓'); }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (landmarker) { try { landmarker.close(); } catch {} }
    landmarker = null; stream = null; video = null;
    onStatus && onStatus('rosto desligado');
  }

  return { start, stop, calibrate, setGain: (g) => { gain = g; }, isRunning: () => running };
}
