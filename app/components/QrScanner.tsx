"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Flashlight, FlashlightOff, ImageUp, Loader2, RotateCcw, X } from "lucide-react";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts: { formats: string[] }): BarcodeDetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

async function createNativeDetector(): Promise<BarcodeDetectorLike | null> {
  try {
    if (!window.BarcodeDetector) return null;
    const formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? [];
    if (!formats.includes("qr_code")) return null;
    return new window.BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function decodeWithJsQR(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
) {
  // Downscale large frames — jsQR is CPU bound and 720px is plenty for QR codes.
  const scale = Math.min(1, 720 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

type Props = {
  onResult: (text: string) => void;
  onClose: () => void;
  /** Shown over the camera, e.g. "That's not a UPI QR" */
  hint?: string | null;
};

export default function QrScanner({ onResult, onClose, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onResultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"starting" | "waiting" | "live" | "needs-tap">("starting");
  const [attempt, setAttempt] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [decodingFile, setDecodingFile] = useState(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let lastScan = 0;
    let lastValue = "";

    async function getStream() {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        // Some devices reject the size/facing hints; retry with the plainest request.
        if (name === "OverconstrainedError" || name === "NotReadableError" || name === "AbortError") {
          return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        throw e;
      }
    }

    async function start() {
      setError(null);
      setStatus("starting");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(
          `Camera needs a secure connection, but this page was opened over ${location.protocol.replace(":", "")}. Open https://${location.host} instead, or upload a QR image.`,
        );
        return;
      }

      try {
        const perm = await navigator.permissions?.query({ name: "camera" as PermissionName });
        if (perm?.state === "denied") {
          setError(
            "Camera access is blocked for this site. Tap the icon left of the address bar → Permissions → Camera → Allow, then tap Retry.",
          );
          return;
        }
      } catch {
        // Permissions API doesn't know "camera" in every browser; just try getUserMedia.
      }

      // If the permission prompt never resolves, tell the user instead of showing a black screen.
      const slow = setTimeout(() => !stopped && setStatus("waiting"), 4000);
      try {
        stream = await getStream();
      } catch (e) {
        const err = e as DOMException;
        setError(
          err?.name === "NotAllowedError"
            ? "Camera permission was denied. Tap the icon left of the address bar → Permissions → Camera → Allow, then tap Retry."
            : err?.name === "NotFoundError"
              ? "No camera found on this device. You can upload a QR image instead."
              : err?.name === "NotReadableError"
                ? "The camera is being used by another app. Close it and tap Retry."
                : `Couldn't start the camera (${err?.name || "unknown error"}). Tap Retry or upload a QR image.`,
        );
        return;
      } finally {
        clearTimeout(slow);
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;
      setTorchSupported(Boolean(caps?.torch));

      const video = videoRef.current!;
      video.srcObject = stream;
      try {
        await video.play();
        setStatus("live");
      } catch {
        // Autoplay was refused; a tap on the screen will start it.
        setStatus("needs-tap");
      }

      const detector = await createNativeDetector();

      const tick = async (time: number) => {
        if (stopped) return;
        if (time - lastScan > 180 && video.readyState >= 2) {
          lastScan = time;
          let value: string | null = null;
          try {
            if (detector) {
              value = (await detector.detect(video))[0]?.rawValue ?? null;
            } else if (canvasRef.current) {
              value = decodeWithJsQR(
                canvasRef.current,
                video,
                video.videoWidth,
                video.videoHeight,
              );
            }
          } catch {
            // Frame decode failures are normal; keep scanning.
          }
          // Avoid re-firing for the same code while it's still in view.
          if (value && value !== lastValue) {
            lastValue = value;
            navigator.vibrate?.(60);
            onResultRef.current(value);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    // Deferred so React's dev double-mount doesn't open the camera twice at once,
    // which hangs or fails on some Android phones.
    const timer = setTimeout(start, 50);
    return () => {
      stopped = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [attempt]);

  async function playVideo() {
    try {
      await videoRef.current?.play();
      setStatus("live");
    } catch {
      setError("Couldn't start the camera preview. Tap Retry.");
    }
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });
      setTorchOn(!torchOn);
    } catch {
      setTorchSupported(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || !canvasRef.current) return;
    setDecodingFile(true);
    try {
      const bitmap = await createImageBitmap(file);
      const detector = await createNativeDetector();
      let value: string | null = null;
      if (detector) value = (await detector.detect(bitmap))[0]?.rawValue ?? null;
      if (!value)
        value = decodeWithJsQR(
          canvasRef.current,
          bitmap,
          bitmap.width,
          bitmap.height,
        );
      bitmap.close();
      if (value) onResultRef.current(value);
      else setError("No QR code found in that image. Try a clearer photo.");
    } catch {
      setError("Couldn't read that image.");
    } finally {
      setDecodingFile(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Dimmed overlay with a clear square cut-out */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative aspect-square w-[min(72vw,320px)] rounded-3xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]">
          <span className="absolute -left-0.5 -top-0.5 h-10 w-10 rounded-tl-3xl border-l-4 border-t-4 border-white" />
          <span className="absolute -right-0.5 -top-0.5 h-10 w-10 rounded-tr-3xl border-r-4 border-t-4 border-white" />
          <span className="absolute -bottom-0.5 -left-0.5 h-10 w-10 rounded-bl-3xl border-b-4 border-l-4 border-white" />
          <span className="absolute -bottom-0.5 -right-0.5 h-10 w-10 rounded-br-3xl border-b-4 border-r-4 border-white" />
          {!error && status === "live" && <span className="scan-line absolute inset-x-4 h-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_16px_var(--accent)]" />}
        </div>
      </div>

      <header className="relative flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium tracking-wide">Scan any UPI QR</p>
        {torchSupported ? (
          <button
            onClick={toggleTorch}
            aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
          >
            {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
        ) : (
          <span className="h-11 w-11" />
        )}
      </header>

      <div className="relative mt-auto flex flex-col items-center gap-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {error ? (
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-black/75 px-4 py-3 text-center text-sm backdrop-blur">
            <p>{error}</p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 font-semibold transition hover:bg-white/30"
            >
              <RotateCcw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : status === "needs-tap" ? (
          <button
            onClick={playVideo}
            className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold shadow-lg"
          >
            <Camera className="h-4 w-4" /> Tap to start camera
          </button>
        ) : status === "starting" ? (
          <p className="flex items-center gap-2 rounded-2xl bg-black/70 px-4 py-3 text-sm backdrop-blur">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
          </p>
        ) : status === "waiting" ? (
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-black/75 px-4 py-3 text-center text-sm backdrop-blur">
            <p>
              Waiting for camera permission. If you don&apos;t see a prompt, tap the icon left of the address bar →
              Permissions → Camera → Allow, then tap Retry.
            </p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 font-semibold transition hover:bg-white/30"
            >
              <RotateCcw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : (
          hint && (
            <p className="max-w-sm rounded-2xl bg-black/70 px-4 py-3 text-center text-sm backdrop-blur">{hint}</p>
          )
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-white/90">
          <ImageUp className="h-4 w-4" />
          {decodingFile ? "Reading image…" : "Upload QR from gallery"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
