import React, { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function KinemojiRender() {
  const [searchParams] = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const text = searchParams.get('text') || '';
  const type = searchParams.get('type') || 'standard';
  const action = searchParams.get('action') || 'static';
  const width = parseInt(searchParams.get('width') || '400');
  const height = parseInt(searchParams.get('height') || '200');
  const foreColor = searchParams.get('foreColor') || '#ffffff';
  const backColor = searchParams.get('backColor') || '#000000';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    const maxFrames = 30;

    const render = (currentFrame: number) => {
      // Background
      ctx.fillStyle = backColor;
      ctx.fillRect(0, 0, width, height);

      // Text settings
      ctx.fillStyle = foreColor;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let displayText = text;
      if (action === 'typewriter') {
        const charCount = Math.floor((currentFrame / maxFrames) * text.length);
        displayText = text.substring(0, charCount);
      }

      // Simple animation effect
      let yOffset = 0;
      if (action === 'animation') {
        yOffset = Math.sin((currentFrame / maxFrames) * Math.PI * 2) * 10;
      }

      ctx.fillText(displayText, width / 2, height / 2 + yOffset);
    };

    // Initial render for static
    render(0);

    // Expose to window for Puppeteer
    (window as any).advanceFrame = (f: number) => {
      render(f);
      return true;
    };
    (window as any).isKinemojiReady = true;

    return () => {
      delete (window as any).advanceFrame;
      delete (window as any).isKinemojiReady;
    };
  }, [text, type, action, width, height, foreColor, backColor]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height} 
        style={{ border: '1px solid #333' }}
      />
    </div>
  );
}
