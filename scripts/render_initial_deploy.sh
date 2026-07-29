#!/bin/sh
# Render initialDeployHook for sadie-web -- runs ONCE, after the first
# successful deploy. See scripts/render_predeploy.sh for why this is a
# standalone script rather than an inline "cmd1 || true; cmd2" string.
#
# createsuperuser is allowed to fail (e.g. it's a re-run, or the
# DJANGO_SUPERUSER_* secrets weren't set yet) without blocking the seed step.
python manage.py createsuperuser --noinput || true
python manage.py render_seed
