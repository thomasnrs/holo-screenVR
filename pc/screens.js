import * as THREE from 'three';

// Captura um app/janela/aba (via getDisplayMedia) como textura ao vivo.
// Retorna o "label" da fonte capturada. Lanca erro se a captura falhar
// (quem chama mostra a mensagem). Retorna null se o usuario cancelar.
export async function captureInto(mesh) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('getDisplayMedia indisponível — abra no Chrome/Edge/Brave (não no navegador do VS Code)');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 } },
      audio: false,
    });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'AbortError') return null; // usuario cancelou
    throw e;
  }

  const track = stream.getVideoTracks()[0];
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  mesh.material.map = tex;
  mesh.material.needsUpdate = true;

  track.addEventListener('ended', () => {
    mesh.material.map = mesh.userData.baseTex;
    mesh.material.needsUpdate = true;
  });

  return track.label || '';
}
