import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Download, Play, Settings, Image as ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import KinemojiRender from './pages/KinemojiRender';

function Generator() {
  const [text, setText] = useState('LUPIN THE THIRD');
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const currentIdRef = useRef<string | null>(null);

  const checkStatus = async (id: string) => {
    try {
      const statusRes = await fetch(`/api/kinemoji/status/${id}`);
      if (!statusRes.ok) return null;
      const data = await statusRes.json();
      
      const currentProgress = data.progress ?? 0;
      const currentStatus = data.status ?? 'pending';
      let currentImageUrl = data.imageUrl || data.image_url;
      if (currentImageUrl && !currentImageUrl.startsWith('http')) {
        currentImageUrl = `https://${currentImageUrl}`;
      }
      const currentError = data.error;

      setProgress(currentProgress);
      
      if (currentStatus === 'processing') {
        setStatusMessage(`Processing... ${currentProgress}%`);
      }
      
      if (currentStatus === 'completed' && currentImageUrl) {
        setImageUrl(currentImageUrl);
        setStatus('completed');
        setStatusMessage('Generation complete!');
        return 'completed';
      } else if (currentStatus === 'failed') {
        setStatus('failed');
        setError(currentError || 'Generation failed');
        setStatusMessage('Generation failed.');
        return 'failed';
      }
      return currentStatus;
    } catch (err) {
      console.error('Check status error:', err);
      return null;
    }
  };

  const generateGif = async () => {
    setStatus('processing');
    setProgress(10);
    setError('');
    setStatusMessage('Starting generation...');
    
    const id = crypto.randomUUID();
    currentIdRef.current = id;
    const payload = {
      id,
      text,
      type: 'standard',
      action: 'typewriter',
      width: 400,
      height: 200,
      foreColor: '#ffffff',
      backColor: '#000000',
      shortId: id.split('-')[0]
    };

    try {
      const response = await fetch('/api/kinemoji/gif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to start generation');

      // Polling for status
      const pollInterval = setInterval(async () => {
        const result = await checkStatus(id);
        if (result === 'completed' || result === 'failed') {
          clearInterval(pollInterval);
        }
      }, 1500);

      // Cleanup interval after 5 minutes just in case
      setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatusMessage('Generation failed.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tighter bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
            Kinemoji GIF
          </h1>
          <p className="text-zinc-400">Generate animated typewriter GIFs for your projects.</p>
        </header>

        <main className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Text Content</label>
            <input 
              type="text" 
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              placeholder="Enter text..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Animation</label>
              <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 focus:outline-none">
                <option>Typewriter</option>
                <option>Floating</option>
                <option>Static</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Theme</label>
              <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 focus:outline-none">
                <option>Classic Black</option>
                <option>Matrix Green</option>
                <option>Cyber Red</option>
              </select>
            </div>
          </div>

          <button 
            onClick={generateGif}
            disabled={status === 'processing'}
            className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {status === 'processing' ? (
              <>
                <Loader2 className="animate-spin" />
                Generating... {progress}%
              </>
            ) : (
              <>
                <Play size={20} fill="currentColor" />
                Generate GIF
              </>
            )}
          </button>

          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="pt-6 border-t border-zinc-800"
              >
                {status === 'processing' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">{statusMessage}</span>
                        <button 
                          onClick={async () => {
                            if (currentIdRef.current) {
                              await checkStatus(currentIdRef.current);
                            }
                          }}
                          className="px-2 py-1 bg-zinc-800 rounded text-[10px] uppercase tracking-widest text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all flex items-center gap-1"
                        >
                          <Settings size={10} className="animate-pulse" />
                          Refresh Status
                        </button>
                      </div>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-white"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {status === 'completed' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                      <CheckCircle2 size={16} />
                      Generation Complete!
                    </div>
                    <div className="aspect-video bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden">
                      <img src={imageUrl} alt="Generated GIF" className="max-w-full max-h-full" />
                    </div>
                    <a 
                      href={imageUrl} 
                      download 
                      className="flex items-center justify-center gap-2 w-full py-3 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      <Download size={18} />
                      Download GIF
                    </a>
                  </div>
                )}

                {status === 'failed' && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400">
                    <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    <div className="text-sm flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-bold">Generation Failed</p>
                        <button 
                          onClick={async () => {
                            if (currentIdRef.current) {
                              await checkStatus(currentIdRef.current);
                            }
                          }}
                          className="px-2 py-1 bg-red-500/20 rounded text-[10px] uppercase tracking-widest text-red-300 hover:bg-red-500/30 transition-all"
                        >
                          Retry Check
                        </button>
                      </div>
                      <p className="opacity-80">{error || 'Please check your configuration and try again.'}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="text-center text-zinc-600 text-xs">
          <p>© 2026 Kinemoji. Powered by Puppeteer & GIF Encoder.</p>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Generator />} />
        <Route path="/kinemoji/render" element={<KinemojiRender />} />
      </Routes>
    </BrowserRouter>
  );
}
