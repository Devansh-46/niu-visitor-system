'use client';
import { useRef, useState } from 'react';
import { toast } from './Toast';

interface Props {
  photo: string | null;
  onChange: (photo: string | null) => void;
}

export function PhotoCapture({ photo, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Camera not supported. Ensure you are on HTTPS or localhost.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 400 },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
    } catch (err: any) {
      console.error('Camera Error:', err);
      toast(`Camera error: ${err.message || 'Permission denied or in use.'}`, 'error');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }

  function capture() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.7);
    stopCamera();
    onChange(dataUrl);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clear() {
    stopCamera();
    onChange(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="col-span-full border border-dashed border-line rounded-lg p-4 bg-paper">
      <label className="text-xs font-medium text-niu-navy tracking-[0.3px] mb-3 block">
        Visitor Photo <span className="text-danger">*</span>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start">
        <div className="w-[200px] h-[200px] bg-paper-warm border border-line rounded-md flex items-center justify-center overflow-hidden relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!streaming ? 'hidden' : ''}`}
          />
          {!streaming && photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Visitor" className="w-full h-full object-cover" />
          )}
          {!streaming && !photo && (
            <div className="text-center text-muted text-xs">
              <div className="text-[32px] mb-1">📷</div>
              <div>No photo captured</div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted mb-1.5 leading-relaxed">
            Use your webcam to capture a quick ID photo, or upload an existing image file.
          </p>
          {!streaming && <Btn variant="outline" onClick={startCamera}>📹 Start Camera</Btn>}
          {streaming && <Btn variant="gold" onClick={capture}>📸 Capture Photo</Btn>}
          <Btn variant="outline" onClick={() => fileRef.current?.click()}>
            📁 Upload Image
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          {photo && <Btn variant="danger" onClick={clear}>✕ Remove Photo</Btn>}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function Btn({
  variant,
  children,
  onClick,
}: {
  variant: 'outline' | 'gold' | 'danger';
  children: React.ReactNode;
  onClick: () => void;
}) {
  const base =
    'px-[18px] py-[11px] rounded-md text-sm font-medium cursor-pointer transition-all inline-flex items-center justify-center gap-2 border';
  const styles = {
    outline: 'bg-transparent text-niu-navy border-line hover:bg-paper-warm hover:border-niu-navy',
    gold: 'bg-niu-gold text-niu-navy font-semibold border-niu-gold hover:bg-niu-gold-soft',
    danger: 'bg-white text-danger border-danger',
  };
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}
