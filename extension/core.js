export const MODELS = {
  lite: { label: 'Veo 3.1 Lite', maxCredits: 10 },
  lower: { label: 'Veo 3.1 Lite [Lower Priority]', maxCredits: 0 }
};
export function isLocalPngPath(path) {
  if(typeof path!=='string'||/[\0\r\n]/.test(path)||!path.toLowerCase().endsWith('.png'))return false;
  return path.startsWith('/')||/^[a-z]:[\\/]/i.test(path)||/^\\\\[^\\/]+\\[^\\/]+\\/.test(path);
}
export function localFileName(path) {
  return path.split(/[\\/]/).pop();
}
export function sameFlowProject(actual,expected) {
  try{
    const normalize=value=>{
      const u=new URL(value);
      if(u.origin!=='https://flow.google.com'||u.username||u.password||!/^\/(?:u\/\d+\/)?project\/[^/]+$/.test(u.pathname))return null;
      // Google appends this login redirect marker to an unchanged project.
      if(u.searchParams.getAll('pli').length===1&&u.searchParams.get('pli')==='1')u.searchParams.delete('pli');
      return u.href;
    };
    const a=normalize(actual),b=normalize(expected);
    return a!==null&&a===b;
  }catch{return false;}
}
export function sourceFor(index) {
  if (!Number.isInteger(index) || index < 0) throw Error('Indice de cena invalido.');
  return index < 2 ? { type: 'original' } : { type: 'last_frame', scene: index - 1 };
}
export function validatePreset(preset) {
  if (!preset || !Array.isArray(preset.prompts) || preset.prompts.length < 1 || preset.prompts.length > 6)
    throw Error('Use de 1 a 6 cenas.');
  if (![4,6,8].includes(preset.seconds ?? 8)) throw Error('Use duracao explicita de 4, 6 ou 8 segundos.');
  if (preset.prompts.some(p => typeof p !== 'string' || !p.trim())) throw Error('Preencha o prompt de todas as cenas.');
  if (!MODELS[preset.model]) throw Error('Modelo invalido.');
}
export function assertSettings(s, model, limit = MODELS[model]?.maxCredits, outputs = 1, seconds = 8) {
  if (![4,6,8].includes(seconds)) throw Error('Use duracao de 4, 6 ou 8 segundos.');
  if (![1,3,4].includes(outputs)) throw Error("Use x1, x3 ou x4.");
  const t = s.model.toLowerCase();
  if (!/veo\s*3[.,]1/.test(t) || !/lite/.test(t)) throw Error('O modelo selecionado nao e Veo 3.1 Lite.');
  const lower = /lower\s*priority|baixa\s*prioridade|prioridade\s*(mais\s*)?baixa/i.test(t);
  if ((model === 'lower') !== lower) throw Error('A modalidade Lite selecionada nao corresponde ao preset.');
  if (!Number.isFinite(s.credits) || s.credits < 0 || s.credits > limit)
    throw Error(`Custo nao confirmado ou acima do teto de ${limit} creditos por cena.`);
  if (model === 'lower' && s.credits !== 0) throw Error('Lower Priority precisa mostrar zero creditos.');
  if (!s.video || !s.frames || s.ratio !== '9:16' || s.count !== `x${outputs}` || !s.summary.includes('720p') || !new RegExp(`\\b${seconds}\\s*s\\b`).test(s.summary))
    throw Error(`Confirme Video, Frames, 720p, ${seconds}s, 9:16 e x${outputs} no Flow.`);
  if (s.agent) throw Error('Desative o modo Agent do Flow.');
  return s.credits;
}
export function mediaKey(url) {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}
export function newVideos(videos, baseline) {
  const seen = new Set(baseline);
  return [...new Map(videos.filter(v => !seen.has(v.key)).map(v => [v.key, v])).values()];
}
export function slug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0,64) || 'cenario';
}
export function renderPrompt(prompt) {
  // Keep the saved production source unchanged. Match the submitted resolution to the actual job.
  return prompt.replace(/1080\s*[x×]\s*1920/gi, '720x1280');
}
export function newRun(name, preset) {
  validatePreset(preset);
  return { id: crypto.randomUUID(), name: slug(name), created: Date.now(), status: 'ready',
    preset: structuredClone(preset), projectUrl: null, tabId: null, error: '',
    scenes: preset.prompts.map((prompt, index) => ({ index, prompt: renderPrompt(prompt), source: sourceFor(index), state: 'ready' })) };
}

export function projectMatchesHome(url, home) {
  try {
    const p=new URL(url);const h=new URL(home);
    return h.origin==='https://flow.google.com'&&/^\/(?:u\/\d+\/)?$/.test(h.pathname)&&!h.search&&!h.hash&&!h.username&&!h.password&&p.origin===h.origin&&!p.username&&!p.password&&p.pathname.startsWith(h.pathname)&&/^project\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.pathname.slice(h.pathname.length));
  } catch {return false;}
}

// Upload/download buffers are per tab on both supported native platforms.
export function parallelIoEnabled(platform) {
  return /win|mac/i.test(platform || '');
}
