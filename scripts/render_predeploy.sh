#!/bin/sh
# Render preDeployCommand for sadie-web.
#
# Kept as a standalone script (rather than a single "cmd1 && cmd2" string in
# render.yaml) because Render's preDeployCommand/initialDeployHook fields do
# NOT reliably support shell operators (&&, ;, ||) inline -- they get passed
# through as literal argv tokens in some cases, causing "unrecognized
# arguments" or "not found" errors. A plain script file with a single,
# argument-free invocation sidesteps that entirely.
set -e

python manage.py enable_postgis
python manage.py migrate --noinput
# One-off data steps that ship with code (e.g. re-imports). Each runs once per
# environment; see imports/management/commands/apply_data_upgrades.py.
python manage.py apply_data_upgrades
