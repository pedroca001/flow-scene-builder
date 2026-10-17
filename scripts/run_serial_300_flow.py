#!/usr/bin/env python3
"""Produce the 15 October paired batch strictly one Flow job at a time."""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bridge
import flow_scene_builder as pipeline
import platform_lock
from scripts.compose_hook_recipe import compose

DEFAULT_INTERVAL_SECONDS = 30

HOOK_PROMPT = """Animate this exact initial image for 8 seconds at ordinary real speed. Begin visible motion at frame zero and complete the core event by 2.5 seconds
Preserve source actors, clothing, objects, background and framing. After the event settle naturally without a second gag.
No setup pause, slow motion, cuts, speech, captions, music or lip-sync. All adults remain fully clothed. Only quiet natural ambient sound."""

LOCK = """CONTINUITY LOCK:
The provided visual source is the authority for the entire scene. Preserve the exact same physical location, background, work surface, camera position, framing, lighting, colors, hands, clothing, bowl, whisk, ingredient packaging and object layout shown in that source. Keep all props in their established positions except the prop currently being handled. The two original hands must move normally, leave their starting positions to reach objects, and remain attached to their original arms. The former position of a moving hand becomes empty; do not retain a stationary copy of that hand. Keep the existing product identities, colors and labels. Keep background activity consistent with the source. One uninterrupted fixed-camera shot at normal speed. No cut, scene transition, new setting, new background, camera move, zoom, redesign, replacement objects, or reset to an earlier state. Do not introduce a bar, kitchen, room, countertop, person or prop that is not present in the source. The scene must remain visually continuous for the full duration.
PHYSICAL CONSERVATION:
Exactly the same two hands belonging to the same two arms throughout. Each hand remains attached to its own arm. Never add a third hand, extra arm, detached hand, or second person. Preserve the exact count, shape, size, material and label of every existing object. A handled object moves from its original place into the hand and then back; its original place stays empty until it returns. Never leave a copy behind, duplicate an object, create a new bottle, duplicate a ruler, or transfer one product label onto another object. Keep both hands and handled objects within the established frame. No camera drift, reframing or crop change."""

ENDING = """Preserve the source camera texture and perspective. Natural environmental and handling sounds only. No speech, music, captions, graphics, cinematic effects or slow motion."""

RECIPE_PROMPTS = [
f"""Animate the supplied image for 8 seconds. Start with the exact supplied image as the first frame and preserve its environment throughout.
{LOCK}
ACTION:
Gently whisk the existing yellow mixture with the same visible whisk while the other hand steadies the existing bowl. Preserve the bowl's location and the source composition. Use small natural hand movements and a believable liquid vortex. In the final two seconds, stop whisking, rest that same whisk inside the bowl and release the whisk with the mixing hand. Keep all ingredients, packaging and background in place. For the final two seconds, the left hand continues to steady the bowl; the right hand releases the whisk and rests on the near-right tabletop. Do not reach for, touch, lift or change any ingredient packaging in this clip.
{ENDING}""",
f"""Animate the supplied exact last frame of the previous clip for 8 NEW seconds, continuing directly from that pose. Use that image as the exact first frame. This is the next moment of the same uninterrupted shot, not a new scene. Do not repeat the previous actions.
{LOCK}
ACTION:
Continue from the exact final pose of the source clip. First lift the existing left hand away from its lower-left starting position beside the bowl; that former position becomes empty. That same left hand reaches for the baking soda container already present in the scene, grips that same container, and lifts it over the existing bowl. Tip a single brief light dusting of white baking soda through its already visible real opening into the existing mixture, then stop pouring immediately. Turn it upright, return it to its original position and visibly release it. The whisk remains inside the bowl. Keep a small patch of powder visible. No dramatic foam eruption. The existing right hand stays beside the bowl and does not touch any ingredient. The honey bottle, gelatin box, whole lemon and cut lemon half remain completely untouched and unchanged throughout this clip. End with both hands empty and still after returning the baking soda. Preserve everything else exactly.
{ENDING}""",
f"""Animate the supplied exact last frame of the previous clip for 8 NEW seconds, continuing directly from that pose. Use that image as the exact first frame. This is the next moment of the same uninterrupted shot, not a new scene. Do not repeat the previous actions.
{LOCK}
ACTION:
Continue from the exact final pose of the source clip. Lift the existing right hand from its lower-right position beside the bowl, leaving that former position empty, and use that same right hand to pick up the honey bottle already present in the scene. The left hand rests still beside the bowl. Point its existing nozzle downward over the same bowl and squeeze one short strand of honey into the existing mixture. Return the same bottle upright to its original position and release it. With that same right hand, pick up only the cut lemon half already visible, squeeze a few drops into that bowl, and return it to its original position. The whole uncut lemon remains untouched in its original place. Do not cut it or create another lemon half. No other hand performs the actions. Use ordinary quick but physically plausible handling within eight seconds. Keep the whisk resting untouched inside the bowl for this whole clip. After returning the original lemon half, both hands stop and remain still. Do not start mixing in this clip. Preserve every other object and the entire environment.
{ENDING}""",
f"""Animate the supplied exact last frame of the previous clip for 8 NEW seconds, continuing directly from that pose. Use that image as the exact first frame. This is the next moment of the same uninterrupted shot, not a new scene. Do not repeat the previous actions.
{LOCK}
ACTION:
Continue from the exact final pose of the source clip. Grip the same whisk and gently stir the existing mixture clockwise for about four seconds while the other hand steadies the same bowl. Stop and rest the whisk inside the bowl. Place both hands around that bowl, lift it about ten centimeters toward the fixed camera and hold it level for the final two seconds. The same whisk remains visibly resting inside the bowl throughout the lift and final hold. Never remove, hide or dissolve it. Keep the whole bowl visible and the existing background unchanged. The liquid gently sloshes and settles. No new ingredients or objects.
{ENDING}""",
]

HUMAN_BLOCKING = re.compile(r"login|captcha|termos|conta|account|quota|credit|crédito|limit|custo|paid|pagamento", re.I)
CHROME_COOLDOWN = re.compile(r"unusual activity|atividade incomum|automation detected|automação detectada|detected automation", re.I)


def atomic(path, value):
    bridge.atomic(Path(path), value)


def discover(root):
    found = {}
    pattern = re.compile(r"^(\d{3})_(\d{3})_(recipe|hook)_.+\.png$", re.I)
    for path in (root / "aprovadas").glob("*.png"):
        if path.name.startswith("._"):
            continue
        match = pattern.match(path.name)
        if not match:
            raise ValueError(f"Nome inesperado: {path.name}")
        pair_id, kind = match.group(2), match.group(3).lower()
        if kind in found.setdefault(pair_id, {}):
            raise ValueError(f"Duplicata {pair_id} {kind}")
        found[pair_id][kind] = path.resolve()
    if len(found) != 300 or any(set(row) != {"hook", "recipe"} for row in found.values()):
        raise ValueError(f"Esperados 300 pares completos; encontrados {len(found)}")
    return [{"id": key, **{kind: str(value) for kind, value in found[key].items()}} for key in sorted(found)]


def ensure_contract(work, pairs):
    presets = work / "presets"
    presets.mkdir(parents=True, exist_ok=True)
    hook = presets / "hook_8s.json"
    recipe = presets / "recipe_4x8s.json"
    atomic(hook, {"version": 1, "model": "lower", "seconds": 8, "prompts": [HOOK_PROMPT]})
    atomic(recipe, {"version": 1, "model": "lower", "seconds": 8, "prompts": RECIPE_PROMPTS})
    manifest = work / "manifest.json"
    existing = json.loads(manifest.read_text(encoding="utf-8-sig")) if manifest.exists() else {}
    if existing and existing.get("pairs") != pairs:
        raise ValueError("Manifesto existente diverge das 600 fontes atuais.")
    if not existing:
        existing = {"version": 1, "batch": "15_de_outubro_300_videos_flow", "pairs": pairs,
                    "account_email": "operator@example.invalid", "flow_home": "https://flow.google.com/u/2/",
                    "model": "lower", "outputs": 1, "duration_seconds": 8,
                    "min_submission_interval_seconds": DEFAULT_INTERVAL_SECONDS, "shared_project": None,
                    "jobs": {}, "deliveries": {}}
        atomic(manifest, existing)
    return manifest, existing, hook, recipe


def queue_row(folder):
    target = str(Path(folder).resolve())
    return next((row for row in bridge.status() if row["folder"] == target), None)


def ensure_job(manifest_path, manifest, pair, kind, preset, jobs_root):
    key = f"{pair['id']}_{kind}"
    item = manifest["jobs"].get(key)
    if item:
        if not queue_row(item["folder"]):
            raise ValueError(f"Job registrado sumiu da fila: {key}")
        _, state = pipeline.read_state(item['folder'])
        if state.get('project') != manifest.get('shared_project'):
            raise ValueError(f"Job {key} preservado no projeto anterior; reconciliar o envio antes de transferir ao projeto atual.")
        return item
    project = manifest.get("shared_project")
    if not project:
        raise ValueError("Projeto compartilhado do Flow ainda nao foi reconciliado.")
    result = bridge.start(pair[kind], name=f"15out_{key}", project=project, outputs=1, output_root=jobs_root,
                          prepare_only=True, mode="frames_continuous", account_email=manifest["account_email"],
                          home=manifest["flow_home"], model="lower", max_total_credits=0,
                          preset_file=preset, audio_retry_limit=2)
    folder, state = pipeline.read_state(result["folder"])
    interval = manifest.get("min_submission_interval_seconds", DEFAULT_INTERVAL_SECONDS)
    state["min_submission_interval_seconds"] = interval
    state["technical_retry_limit"] = 2
    if manifest.get('recovery_policy'):state['recovery_policy']=manifest['recovery_policy']
    pipeline.write_state(folder, state)
    reason = f"Pedro autorizou este lote serial x1 no Veo 3.1 Low Priority gratuito, com ate duas repeticoes tecnicas por cena e intervalo minimo de {interval} segundos."
    bridge.authorize_retries(folder, reason)
    bridge.activate(folder, reason)
    item = {"folder": str(folder), "kind": kind, "source": pair[kind], "source_sha256": pipeline.digest(pair[kind])}
    manifest["jobs"][key] = item
    atomic(manifest_path, manifest)
    return item


def wait_job(item, state_path):
    recovered_pauses = set()
    while True:
        row = queue_row(item["folder"])
        if not row:
            raise ValueError("Job ativo ausente da fila; preservado para reconciliacao.")
        atomic(state_path, {"updated_at": pipeline.now(), "current_folder": item["folder"], "queue": row})
        if row["state"] == "complete":
            return pipeline.verify(item["folder"])
        if row["state"] == "paused":
            error = row.get("error") or "pausa sem diagnostico"
            if HUMAN_BLOCKING.search(error) and not CHROME_COOLDOWN.search(error):
                raise RuntimeError("BLOQUEIO_HUMANO: " + error)
            _,saved=pipeline.read_state(item['folder'])
            if saved.get('recovery_policy',{}).get('authorization'):
                try:request=bridge.schedule_cooldown(item['folder'])
                except ValueError as failure:
                    atomic(state_path,{'updated_at':pipeline.now(),'current_folder':item['folder'],'recovery':'human_required','error':str(failure)})
                    raise
                if request:
                    atomic(state_path,{'updated_at':pipeline.now(),'current_folder':item['folder'],'recovery':'cooldown_10_minutes','error':error,'retry_at_epoch':request['due_at'],'probe_status':request['status']})
                time.sleep(30)
                continue
            if CHROME_COOLDOWN.search(error):
                raise RuntimeError("RECUPERACAO_CHROME_10_MIN_NAO_CONFIGURADA: " + error)
            reason = ("Falha operacional recuperavel no mesmo video; retomar o mesmo job sem fechar o Chrome, "
                      "preservando cenas, envios e contadores. Erro: " + error)
            signature = (error, row.get("queued"), row.get("updated"), row.get("finished"))
            if signature not in recovered_pauses:
                # Retry authorization is written once when the job is created.
                # Re-authorizing every polling cycle bloats state without adding
                # permission or recovery capacity.
                recovered_pauses.add(signature)
                bridge.enqueue(item["folder"])
            atomic(state_path, {"updated_at": pipeline.now(), "current_folder": item["folder"],
                                "recovery": "automatic_same_job", "error": error})
            time.sleep(30)
            continue
        time.sleep(2)


def canonicalize_delivery(pair_id, receipt, output):
    """Give every final a stable pair id, even when a shared Flow project uses a generic title."""
    source = Path(receipt["final"]).resolve()
    target = (output / f"{pair_id}.mp4").resolve()
    if source == target:
        return receipt
    if target.exists():
        if pipeline.digest(target) != receipt["sha256"]:
            raise ValueError(f"Destino final ja existe com outro conteudo: {target}")
        if source.exists() and pipeline.digest(source) == receipt["sha256"]:
            source.unlink()
    else:
        source.rename(target)
    receipt["final"] = str(target)
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--output", default=str(Path.home() / "Downloads/15_de_outubro_300_videos_flow"))
    parser.add_argument("--lane", choices=['a', 'b'])
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    if not root.is_dir() or not os.path.ismount("/Volumes/EXTERNAL_DRIVE"):
        raise ValueError("EXTERNAL_DRIVE nao esta montado.")
    work = root / "relatorios/flow/producao_serial_2026_10_16"
    lanes_path=work/'profile_lanes.json'
    profile_config=json.loads(lanes_path.read_text()) if lanes_path.exists() else {}
    if args.lane:
        if profile_config.get('mode')=='single':
            raise ValueError('Filas de dois perfis desativadas; use o controlador serial sem --lane.')
        work = work / 'lanes' / args.lane
        if not (work / 'manifest.json').is_file():
            raise ValueError('Manifesto da fila de perfil ainda nao foi preparado.')
    elif lanes_path.exists() and profile_config.get('mode','dual')!='single':
        raise ValueError('Lote dividido em dois perfis; use run_dual_profile_300_flow.py.')
    jobs_root = root / "videos_flow_serial_2026_10_16"
    output = Path(args.output).expanduser().resolve()
    work.mkdir(parents=True, exist_ok=True);jobs_root.mkdir(parents=True, exist_ok=True);output.mkdir(parents=True, exist_ok=True)
    controller_lock = (work / "controller.lock").open("a")
    platform_lock.flock(controller_lock, platform_lock.LOCK_EX | platform_lock.LOCK_NB)
    pairs = discover(root)
    if args.lane:
        assigned=json.loads((work/'manifest.json').read_text(encoding='utf-8-sig'))['pairs']
        ids={row['id'] for row in assigned}
        pairs=[row for row in pairs if row['id'] in ids]
        if pairs!=assigned:raise ValueError('Pares da fila divergiram das fontes atuais.')
    manifest_path, manifest, hook_preset, recipe_preset = ensure_contract(work, pairs)
    if not manifest.get("shared_project"):
        for key in reversed(list(manifest.get("jobs", {}))):
            candidate = manifest["jobs"][key].get("folder")
            if not candidate:
                continue
            _, candidate_state = pipeline.read_state(candidate)
            project = candidate_state.get("project")
            if project and project.startswith(manifest["flow_home"] + "project/"):
                manifest["shared_project"] = project
                manifest["shared_project_source_job"] = key
                atomic(manifest_path, manifest)
                break
    if not manifest.get("shared_project"):
        raise ValueError("Nenhum projeto existente confirmado para consolidar o lote.")
    state_path = work / "controller_status.json"
    for pair in pairs:
        pair_id = pair["id"]
        if pair_id in manifest["deliveries"]:
            receipt = manifest["deliveries"][pair_id]
            final = Path(receipt["final"])
            if not final.is_file() or pipeline.digest(final) != receipt["sha256"]:
                raise ValueError(f"Entrega mudou ou sumiu: {pair_id}")
            continue
        completed = {}
        for kind, preset in (("hook", hook_preset), ("recipe", recipe_preset)):
            item = ensure_job(manifest_path, manifest, pair, kind, preset, jobs_root)
            completed[kind] = wait_job(item, state_path)
        receipt = compose(manifest["jobs"][pair_id + "_hook"]["folder"],
                          manifest["jobs"][pair_id + "_recipe"]["folder"], output,
                          output_name=f'{pair_id}.mp4', receipt_path=work/'composition_receipts'/f'{pair_id}.json')
        receipt = canonicalize_delivery(pair_id, receipt, output)
        if abs(receipt["metadata"]["duration"] - 40) > 1:
            raise ValueError(f"Duracao final invalida no par {pair_id}")
        manifest["deliveries"][pair_id] = receipt
        atomic(manifest_path, manifest)
        atomic(state_path, {"updated_at": pipeline.now(), "completed_pairs": len(manifest["deliveries"]),
                            "current_pair": pair_id, "final": receipt["final"]})
    atomic(state_path, {"updated_at": pipeline.now(), "status": "complete", "completed_pairs": len(pairs)})


if __name__ == "__main__":
    main()
