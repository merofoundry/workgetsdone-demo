#!/usr/bin/env python3
"""Task 21: the one-step Google sign-in configure plan for stage. Reads ../.env-google-stage at run time and never prints its values.

python3 provision-google.py [--service-id <existing credential service id>] [out.json]

The platform finds the OAuth client through ONE active service of the application with auth_type oauth2 and settings.oauth_provider
'google' (backend/app/adapters/services/app_oauth_registrations.py). Its encrypted auth_config holds exactly client_id and client_secret;
settings.callback_service_id names the public webhook_in callback service. The redirect URI is not configured anywhere: the platform builds
<application origin>/api/v1/services/<callback id>/inbound, so the Google console must list
https://workgetsdone.staging.merofoundry.app/api/v1/services/0e1bae77-8f8e-4e4e-ab86-d64505d581fc/inbound.
The start and callback services keep auth_type none and carry no credentials.
Without --service-id the plan creates the credential service; with it, the plan rotates auth_config on that service (update_service).
The plan file contains the secret and is written 0600 under /tmp/wgd-plans/; delete it after applying."""
import json, os, sys
from pathlib import Path
APP = '104c98da-971b-4a99-8fad-4fd2ef06eb3f'
CALLBACK = '0e1bae77-8f8e-4e4e-ab86-d64505d581fc'
REDIRECT = 'https://workgetsdone.staging.merofoundry.app/api/v1/services/' + CALLBACK + '/inbound'
ENV = Path(__file__).resolve().parents[2] / '.env-google-stage'
def read_env(path):
    values = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1); values[key.strip()] = value.strip().strip('\'"')
    return values
def main():
    args = sys.argv[1:]; service_id = None
    if '--service-id' in args: i = args.index('--service-id'); service_id = args[i + 1]; del args[i:i + 2]
    out = Path(args[0] if args else '/tmp/wgd-plans/google-stage.json')
    if not ENV.exists(): sys.exit(f'missing {ENV}')
    if ENV.stat().st_mode & 0o077: sys.exit(f'{ENV} must be mode 0600')
    env = read_env(ENV); client_id, secret = env.get('GOOGLE_CLIENT_ID', ''), env.get('GOOGLE_CLIENT_SECRET', '')
    if not client_id or not secret: sys.exit('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set')
    auth_config = {'client_id': client_id, 'client_secret': secret}
    if service_id: op = {'key': 'service.google_oauth_client.rotate', 'name': 'update_service', 'arguments': {'application_id': APP, 'service_id': service_id, 'auth_config': auth_config}}
    else: op = {'key': 'service.google_oauth_client', 'name': 'create_service', 'arguments': {'application_id': APP, 'name': 'google_oauth_client', 'service_type': 'rest', 'base_url': 'https://accounts.google.com', 'auth_type': 'oauth2', 'auth_config': auth_config, 'settings': {'oauth_provider': 'google', 'callback_service_id': CALLBACK}, 'description': 'Google OAuth client for app-level sign-in (ADR 2026-09-06-app-level-federated-login). Credentials are write-only.'}}
    out.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as f: json.dump({'redirectUri': REDIRECT, 'operations': [op]}, f, indent=2); f.write('\n')
    print(f'{op["name"]} plan written to {out} (0600); redirect URI {REDIRECT}; apply the single operation through MCP, then delete the plan file.')
if __name__ == '__main__': main()
