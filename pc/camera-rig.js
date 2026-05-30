import * as THREE from 'three';

// Converte orientacao do dispositivo (alpha/beta/gamma) numa rotacao de camera,
// com suavizacao (slerp) e recentralizacao de "frente".
const ZEE = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const Q_SCREEN = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90deg em X
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Quaternion(); // alvo vindo do giroscopio
    this.yawOffset = new THREE.Quaternion(); // recentralizacao (gira em torno do "up")
    this.mode = 'gyro';
    this.hasGyro = false;
    this.gain = 2.5; // amplifica o movimento: gira pouco o celular, gira muito a camera
    // modo mouse
    this.yaw = 0;
    this.pitch = 0;
  }

  // graus -> rotacao alvo
  setOrientation(alpha, beta, gamma, orient) {
    const a = THREE.MathUtils.degToRad(alpha || 0);
    const b = THREE.MathUtils.degToRad(beta || 0);
    const g = THREE.MathUtils.degToRad(gamma || 0);
    const o = THREE.MathUtils.degToRad(orient || 0);
    _euler.set(b, a, -g, 'YXZ');
    this.target.setFromEuler(_euler);
    this.target.multiply(Q_SCREEN);
    this.target.multiply(_q.setFromAxisAngle(ZEE, -o));
    this.hasGyro = true;
  }

  // define a direcao atual como "frente"
  recenter() {
    if (this.mode === 'gyro') {
      const e = new THREE.Euler().setFromQuaternion(this.target, 'YXZ');
      this.yawOffset.setFromAxisAngle(UP, -e.y);
    } else {
      this.yaw = 0;
      this.pitch = 0;
    }
  }

  setMouse(dx, dy) {
    this.yaw -= dx * 0.0025;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0025, -1.2, 1.2);
  }

  update() {
    if (this.mode === 'gyro' && this.hasGyro) {
      const desired = _q.copy(this.yawOffset).multiply(this.target);
      // amplifica a rotacao em relacao a "frente" pelo ganho de sensibilidade
      if (this.gain !== 1) {
        _euler.setFromQuaternion(desired, 'YXZ');
        _euler.y *= this.gain;
        _euler.x = THREE.MathUtils.clamp(_euler.x * this.gain, -1.45, 1.45);
        desired.setFromEuler(_euler);
      }
      this.camera.quaternion.slerp(desired, 0.25);
    } else {
      _euler.set(this.pitch, this.yaw, 0, 'YXZ');
      const t = this.mode === 'face' ? 0.12 : 0.3; // rosto: mais suave
      this.camera.quaternion.slerp(new THREE.Quaternion().setFromEuler(_euler), t);
    }
  }
}
