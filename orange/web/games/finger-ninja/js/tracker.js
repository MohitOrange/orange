// Camera + MediaPipe hand tracking (fingers only — no face needed).
import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class Tracker {
  constructor(video) {
    this.video = video;
    this.hands = [];        // [{tip:{x,y}, landmarks:[...]}] normalised 0..1 (not mirrored)
    this.handSeenAt = 0;
    this._lastVideoTime = -1;
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    await new Promise((r) => (this.video.videoWidth ? r() : (this.video.onloadedmetadata = r)));
  }

  async loadModels() {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      this.handLm = await make("GPU");
    } catch (e) {
      console.warn("GPU delegate failed, falling back to CPU", e);
      this.handLm = await make("CPU");
    }
  }

  /** Run detection on the newest video frame. Call once per animation frame. */
  update(now) {
    const v = this.video;
    if (!this.handLm || v.readyState < 2 || v.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = v.currentTime;
    const hr = this.handLm.detectForVideo(v, now);
    this.hands = (hr.landmarks || []).map((lm) => ({ tip: lm[8], landmarks: lm }));
    if (this.hands.length) this.handSeenAt = now;
  }

  hasHand(now, grace = 300) { return now - this.handSeenAt < grace; }
}
