"""Rolling admission of unique paired hooks/recipes; no visual quality gate."""
import argparse
import json
import re
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bridge
import flow_scene_builder as pipeline
import platform_lock


def load(path, default):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default


def step(manifest_path):
    root = Path(manifest_path).resolve().parent
    manifest = load(root/'manifest.json', {})
    ledger = load(root/'flow_pairs.json', {'jobs': {}})
    # CUA-owned projects are registered before native admission can reuse a slot.
    for receipt_path in root.glob('manual_ui_*.json'):
        receipt = load(receipt_path, {})
        key = receipt.get('id')
        if not receipt.get('pipeline_folder') or key in ledger['jobs']:
            continue
        pair_id, kind = key.split('_', 1)
        image_receipt = load(root/'image_receipts'/(key+'.json'), {})
        if image_receipt.get('id') != key or kind not in ('hook', 'recipe'):
            raise ValueError('Manual pair receipt mismatch: ' + str(key))
        folder, state = pipeline.read_state(receipt['pipeline_folder'])
        if state.get('project') != receipt.get('project_url') or state.get('original_sha256') != image_receipt.get('sha256'):
            raise ValueError('Manual project/image identity mismatch: ' + key)
        ledger['jobs'][key] = dict(id=key, pair_id=pair_id, kind=kind, folder=str(folder),
                                  image_path=image_receipt['path'],image_sha256=image_receipt['sha256'],
                                  state='prepared', manual_send=state.get('manual_send',False))
    manual_owned = {load(p, {}).get('id') for p in root.glob('manual_ui_*.json')}
    snapshot = bridge.status()
    current = {str(Path(row['folder']).resolve()): row for row in snapshot}
    active = sum(row['state'] in ('queued', 'running') for row in snapshot)
    # Global host limit includes other work. Never take 20 extra slots on top.
    free = max(0, min(20, bridge.parallel_limit()) - active)
    hold = load(bridge.APP/'account_holds.json', {}).get(manifest['account_email'])
    account_hold = bool(hold)
    admission_paused = manifest.get('admission_paused', False) or manifest.get('operator_pause', False)
    account_mismatch = any(row['state'] == 'paused' and any(marker in (row.get('error') or '').lower()
                           for marker in ('conta visivel difere', 'home visivel difere'))
                           for row in snapshot if row['folder'] in {item['folder'] for item in ledger['jobs'].values()})
    # A changed Chrome session must not create a new home tab for every slot.
    # Completed results still reach the editor while account recovery is pending.
    hold = hold or admission_paused or account_mismatch
    recoveries = []
    for key, item in ledger['jobs'].items():
        row = current.get(str(Path(item['folder']).resolve()))
        if not row:
            item['error'] = 'Registered job absent from queue; reconcile, never recreate.'
            continue
        item['state'] = row['state']
        item['error'] = row.get('error')
        if row['state'] == 'complete' and not item.get('final'):
            verification = pipeline.verify(item['folder'])
            item.update(final=verification['final'], sha256=pipeline.digest(verification['final']), verified=True)
        if row['state'] != 'paused' or hold or free <= 0:
            continue
        if manifest.get('manual_send') and not item.get('manual_send'):
            continue  # Old failed jobs need individual reconciliation, not automatic resend.
        if item.get('recovery_ready'):
            # Explicit account rebind marked only idle, never-submitted jobs.
            item['recovery_ready'] = False
            bridge.atomic(root/'flow_pairs.json', ledger)
            bridge.enqueue(item['folder'])
            item['state'] = 'queued'
            recoveries.append(key)
            free -= 1
            continue
        if item.get('recovery_enqueues', 0) >= 2:
            continue
        error = (row.get('error') or '').lower()
        # Existing UI guards require matching receipts/baseline before resubmit.
        # Renaming, login, quota and ambiguous identity remain supervised pauses.
        submitted_recovery = any(marker in error for marker in ('geracao falhou', 'falha ao gerar audio', 'envio antigo ambiguo', 'confirmar aceite da geracao', 'pending100'))
        if item.get('manual_send') and submitted_recovery:
            continue  # Only CUA may send or repeat a generation in hybrid mode.
        preparation_recovery = error.startswith('tempo esgotado:') and any(marker in error for marker in ('nome do projeto', 'nome salvo apos recarregar', 'abrir selecao do frame', 'limpar compositor e encontrar start', 'carregar frame automatico', 'preview do asset de frame nomeado'))
        download_recovery = error == 'tempo esgotado: arquivo de download original do flow.'
        if not submitted_recovery and not preparation_recovery and not download_recovery:
            continue
        _, state = pipeline.read_state(item['folder'])
        scene = next((s for s in state['scenes'] if s['status'] != 'complete'), None)
        if not scene:
            continue
        if download_recovery:
            # Resume downloading the immutable bound result, preserving the
            # submission and retry ledger. The runner resolves this exact ID
            # before any transfer and cannot enter retry_missing with it set.
            receipt = scene.get('submission_receipt') or {}
            if (scene['status'] != 'submitted'
                    or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',scene.get('result_asset_id') or '',re.I)
                    or state.get('project_creation', {}).get('status') not in ('created', 'ready')
                    or not (state.get('project') or '').startswith(manifest['flow_home']+'project/')
                    or receipt.get('email') != manifest['account_email']
                    or receipt.get('home') != manifest['flow_home']
                    or receipt.get('model_key') != 'lower'
                    or receipt.get('credits') != 0 or receipt.get('outputs') != 1):
                continue
        elif len(scene.get('audio_retry_intents', [])) + len(scene.get('technical_retry_intents', [])) >= 2:
            continue
        elif not submitted_recovery:
            # Only known before-upload or already-present-frame controls can
            # repeat preparation. Upload waits and unknown UI pauses remain
            # supervised; never reset submitted or uncertain creation intents.
            if (scene['status'] != 'ready' or scene.get('submission_receipt')
                    or state.get('project_creation', {}).get('status') not in ('created', 'ready')
                    or not (state.get('project') or '').startswith(manifest['flow_home']+'project/')):
                continue
        item['recovery_enqueues'] = item.get('recovery_enqueues', 0) + 1
        bridge.atomic(root/'flow_pairs.json', ledger)
        bridge.enqueue(item['folder'])
        item['state'] = 'queued'
        recoveries.append(key)
        free -= 1
    admitted = []
    if not hold:
        for pair in manifest['pairs']:
            for kind in ('recipe', 'hook'):
                key = pair['id'] + '_' + kind
                if key in ledger['jobs'] or key in manual_owned or free <= 0:
                    continue
                receipt = load(root/'image_receipts'/(key+'.json'), None)
                if not receipt:
                    continue
                if receipt['id'] != key or receipt['pair_id'] != pair['id'] or receipt['kind'] != kind:
                    raise ValueError('Image pair receipt mismatch: ' + key)
                image = Path(receipt['path'])
                if not image.is_file() or pipeline.digest(image) != receipt['sha256']:
                    raise ValueError('Incomplete/changed image: ' + key)
                preset = root/'presets'/('recipe.json' if kind == 'recipe' else key+'.json')
                result = bridge.start(image, name=manifest['batch_name']+'_'+key, outputs=1,
                                      output_root=root/'flow_jobs', prepare_only=True,
                                      mode='frames_continuous', account_email=manifest['account_email'],
                                      home=manifest['flow_home'], model='lower', max_total_credits=0,
                                      preset_file=preset, audio_retry_limit=0 if manifest.get('manual_send') else 2)
                if manifest.get('manual_send'):
                    manual_folder, manual_state = pipeline.read_state(result['folder'])
                    manual_state.update(manual_send=True,technical_retry_limit=0)
                    pipeline.write_state(manual_folder,manual_state)
                item = dict(id=key,pair_id=pair['id'],kind=kind,folder=result['folder'],
                            image_path=str(image),image_sha256=receipt['sha256'],state='prepared',manual_send=bool(manifest.get('manual_send')))
                ledger['jobs'][key] = item
                bridge.atomic(root/'flow_pairs.json', ledger)
                reason = manifest.get('authorization_reason') or ('Pedro autorizou producao de ' + str(manifest.get('quantity',len(manifest['pairs']))) + ' videos no Windows,20slots,sem QA visual; recuperacoes tecnicas limitadas do perfil gratuito existente, sem repeticoes por qualidade.')
                if not item.get('manual_send'):bridge.authorize_retries(item['folder'], reason)
                bridge.activate(item['folder'], reason)
                item['state'] = 'queued'
                bridge.atomic(root/'flow_pairs.json', ledger)
                free -= 1
                admitted.append(key)
    # Resume prepared jobs after a controller interruption, without new projects.
    if not hold:
        for item in ledger['jobs'].values():
            if free <= 0:
                break
            if item.get('state') == 'prepared':
                if manifest.get('manual_send') and not item.get('manual_send'):continue
                reason = 'Retomada do mesmo par autorizado porPedro,sem novo projeto nem QA visual.'
                if not item.get('manual_send'):bridge.authorize_retries(item['folder'], reason)
                bridge.activate(item['folder'], reason)
                item['state'] = 'queued'
                free -= 1
    bridge.atomic(root/'flow_pairs.json', ledger)
    ready = []
    for pair in manifest['pairs']:
        hook = ledger['jobs'].get(pair['id']+'_hook', {})
        recipe = ledger['jobs'].get(pair['id']+'_recipe', {})
        if hook.get('final') and recipe.get('final'):
            ready.append(dict(id=pair['id'],audio=pair['audio'],style=pair['style'],
                              hook_folder=hook['folder'],recipe_folder=recipe['folder']))
    bridge.atomic(root/'ready_edits.json', ready)
    counts = dict(images=len(list((root/'image_receipts').glob('*.json'))),
                  flow_started=len(ledger['jobs']),flow_complete=sum(bool(x.get('final')) for x in ledger['jobs'].values()),
                  active=active+len(admitted)+len(recoveries),pairs_ready=len(ready),
                  edited=len(list((root/'edit_receipts').glob('*.json'))),
                  paused=[dict(id=k,error=v.get('error')) for k,v in ledger['jobs'].items() if v.get('state')=='paused'])
    counts.update(admitted=admitted,recovered=recoveries,account_hold=account_hold or account_mismatch,
                  admission_paused=bool(admission_paused),account_mismatch=bool(account_mismatch),updated_at=pipeline.now())
    bridge.atomic(root/'progress.json', counts)
    return counts


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest')
    p.add_argument('--watch', action='store_true')
    a = p.parse_args()
    root = Path(a.manifest).resolve().parent
    target = int(load(Path(a.manifest), {})['quantity'])
    with (root/'pair_controller.lock').open('a') as lock:
        platform_lock.flock(lock, platform_lock.LOCK_EX | platform_lock.LOCK_NB)
        last = None
        while True:
            result = step(a.manifest)
            signature = json.dumps({k:v for k,v in result.items() if k!='updated_at'},sort_keys=True)
            if signature != last:
                print(json.dumps(result,ensure_ascii=False),flush=True)
                last = signature
            if not a.watch or result['edited'] == target:
                return
            time.sleep(2)


if __name__ == '__main__':
    main()
