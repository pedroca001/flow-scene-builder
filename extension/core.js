export const MODELS = {
  lite: { label: 'Veo 3.1 Lite', maxCredits: 10 },
  lower: { label: 'Veo 3.1 Lite [Lower Priority]', maxCredits: 0 }
};
export function sourceFor(index) {
  if (!Number.isInteger(index) || index < 0) throw Error('Indice de cena invalido.');
  return index < 2 ? { type: 'original' } : { type: 'last_frame', scene: index - 1 };
}
export function validatePreset(preset) {
  if (!preset || !Array.isArray(preset.prompts) || preset.prompts.length < 2 || preset.prompts.length > 6)
    throw Error('Use de 2 a 6 cenas.');
  if (preset.prompts.some(p => typeof p !== 'string' || !p.trim())) throw Error('Preencha o prompt de todas as cenas.');
  if (!MODELS[preset.model]) throw Error('Modelo invalido.');
}
export function assertSettings(s, model, limit = MODELS[model]?.maxCredits, outputs = 1) {
  if (![1,3,4].includes(outputs)) throw Error("Use x1, x3 ou x4.");
  const t = s.model.toLowerCase();
  if (!/veo\s*3[.,]1/.test(t) || !/lite/.test(t)) throw Error('O modelo selecionado nao e Veo 3.1 Lite.');
  const lower = /lower\s*priority|baixa\s*prioridade|prioridade\s*(mais\s*)?baixa/i.test(t);
  if ((model === 'lower') !== lower) throw Error('A modalidade Lite selecionada nao corresponde ao preset.');
  if (!Number.isFinite(s.credits) || s.credits < 0 || s.credits > limit)
    throw Error(`Custo nao confirmado ou acima do teto de ${limit} creditos por cena.`);
  if (model === 'lower' && s.credits !== 0) throw Error('Lower Priority precisa mostrar zero creditos.');
  if (!s.video || !s.frames || s.ratio !== '9:16' || s.count !== `x${outputs}` || !s.summary.includes('720p') || !/\b8\s*s\b/.test(s.summary))
    throw Error(`Confirme Video, Frames, 720p, 8s, 9:16 e x${outputs} no Flow.`);
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
