import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
env.allowLocalModels = false;

let transcriber = null, modelId = null;

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      if (transcriber && modelId === m.model) { self.postMessage({ type: 'loaded' }); return; }
      let device = 'wasm', dtype = 'q8';
      if (navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null)) {
        device = 'webgpu';
        dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' };
      }
      transcriber = await pipeline('automatic-speech-recognition', m.model, {
        device, dtype,
        progress_callback: p => self.postMessage({ type: 'progress', p })
      });
      modelId = m.model;
      self.postMessage({ type: 'loaded', device });
    } else if (m.type === 'transcribe') {
      const out = await transcriber(m.audio, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        ...(m.language ? { language: m.language, task: 'transcribe' } : {})
      });
      const chunks = (out.chunks || []).map(c => ({
        start: c.timestamp[0] ?? 0,
        end: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 2,
        text: (c.text || '').trim()
      })).filter(c => c.text);
      self.postMessage({ type: 'result', id: m.id, chunks, text: out.text });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};