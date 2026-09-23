export const DEFAULT_PRESET = await fetch(new URL('./preset.json', import.meta.url)).then(r => { if (!r.ok) throw Error('Preset ausente. Execute o build.'); return r.json(); });
