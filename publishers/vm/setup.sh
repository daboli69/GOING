#!/usr/bin/env bash
# GOING lab server: one-time setup on a fresh Ubuntu 24.04 server (Hetzner or any other provider).
# Runs the NFL and NBA ensemble labs on a timer and publishes their forecasts to GOING, so the home PC can stay off.
#
#   Run as root on the server:   bash setup.sh
#   Safe to run again: it only adds what is missing and rebuilds the lab environments.
#
# Layout on the server
#   /opt/going/GOING            this repository (the publisher lives in publishers/)
#   /opt/going/labs/<lab>       the lab folders copied from the PC
#   /opt/going/labs.conf        which lab is which, and the command that refreshes each one
#   journalctl -u going-labs    the log of every run
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash setup.sh"; exit 1; }
BASE=/opt/going
USER_NAME=going

echo "== Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 python3-venv python3-dev python3-pip build-essential git curl gh tzdata >/dev/null
# Forecast dates follow the US Eastern day, as on the PC.
timedatectl set-timezone America/New_York || true

echo "== User and folders"
id "$USER_NAME" >/dev/null 2>&1 || useradd -m -s /bin/bash "$USER_NAME"
mkdir -p "$BASE/labs"
chown -R "$USER_NAME:$USER_NAME" "$BASE"
as_going(){ sudo -u "$USER_NAME" -H bash -c "$1"; }

echo "== GitHub login"
# The publisher pushes forecasts to the model-feeds branch and starts a site deploy, so it needs a GitHub login.
# Paste a fine-grained token for daboli69/GOING with Contents: Read and write, and Actions: Read and write.
if ! as_going "gh auth status >/dev/null 2>&1"; then
  read -rsp "Paste your GitHub token and press Enter (it is stored on this server only): " TOKEN </dev/tty; echo
  printf '%s\n' "$TOKEN" | sudo -u "$USER_NAME" -H gh auth login --hostname github.com --git-protocol https --with-token
  unset TOKEN
fi
as_going "gh auth setup-git"
as_going "git config --global user.name 'GOING lab server'; git config --global user.email 'going-lab-server@users.noreply.github.com'"

echo "== GOING repository"
if [ -d "$BASE/GOING/.git" ]; then as_going "git -C $BASE/GOING pull --ff-only -q"
else as_going "git clone -q https://github.com/daboli69/GOING.git $BASE/GOING"; fi

echo "== Lab settings"
if [ ! -f "$BASE/labs.conf" ]; then
  cat > "$BASE/labs.conf" <<'CONF'
# GOING lab server settings. Edit with:  nano /opt/going/labs.conf   (then save with Ctrl+O, Enter, Ctrl+X)
# Folder of each lab under /opt/going/labs (the names you copied over).
GOING_NFL_LAB="/opt/going/labs/nfl-ensemble-lab"
GOING_NBA_LAB="/opt/going/labs/NBA ensemble"
# The command that refreshes each lab (data pull, model run, saved forecasts), run inside its folder with its own
# Python as .venv/bin/python. This is what the lab's Windows scheduled task runs, with .venv\Scripts\python.exe
# written as .venv/bin/python. Leave empty to only publish what is already saved.
NFL_REFRESH=""
NBA_REFRESH=""
# API keys the labs read from the environment, one per line, e.g.:
# export SOME_API_KEY="..."
CONF
  chown "$USER_NAME:$USER_NAME" "$BASE/labs.conf"; chmod 600 "$BASE/labs.conf"
fi

echo "== Lab environments"
# Each lab gets its own Python environment from its requirements.txt (made on the PC with pip freeze).
# Windows-only packages are skipped.
shopt -s nullglob
for lab in "$BASE"/labs/*/; do
  name=$(basename "$lab")
  if [ ! -f "$lab/requirements.txt" ]; then echo "   $name: no requirements.txt, skipped (see the guide, step 5)"; continue; fi
  echo "   $name"
  grep -viE '^(pywin32|pywinpty|pywin32-ctypes|wmi|comtypes|winshell|pypiwin32|win32-setctime)([=<>~ ]|$)' "$lab/requirements.txt" > "$lab/.requirements.linux.txt" || true
  chown -R "$USER_NAME:$USER_NAME" "$lab"
  as_going "cd \"$lab\" && rm -rf .venv && python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r .requirements.linux.txt" \
    || echo "   $name: some packages failed to install; see the message above"
done

echo "== Run script and timer"
cat > "$BASE/run-labs.sh" <<'RUN'
#!/usr/bin/env bash
# One run: refresh each lab, then publish the forecasts (the publisher pushes only when they changed).
set -uo pipefail
set -a; source /opt/going/labs.conf; set +a
git -C /opt/going/GOING pull --ff-only -q || echo "Could not update the GOING repository; using the current copy."
refresh(){
  local name=$1 dir=$2 cmd=$3
  [ -n "$cmd" ] || return 0
  echo "== $name refresh"
  ( cd "$dir" && timeout 3h bash -c "$cmd" ) || echo "!! $name refresh failed; publishing what is already saved"
}
refresh NFL "$GOING_NFL_LAB" "$NFL_REFRESH"
refresh NBA "$GOING_NBA_LAB" "$NBA_REFRESH"
echo "== Publish"
cd /opt/going/GOING && python3 publishers/publish_models.py --push
RUN
chmod +x "$BASE/run-labs.sh"; chown "$USER_NAME:$USER_NAME" "$BASE/run-labs.sh"

cat > /etc/systemd/system/going-labs.service <<UNIT
[Unit]
Description=GOING labs: refresh the NFL and NBA ensembles and publish to the site
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$USER_NAME
ExecStart=/usr/bin/flock -n /tmp/going-labs.lock $BASE/run-labs.sh
TimeoutStartSec=4h
UNIT

cat > /etc/systemd/system/going-labs.timer <<'UNIT'
[Unit]
Description=Run the GOING labs every hour

[Timer]
# Every hour at :15. Change the schedule with:  systemctl edit --full going-labs.timer
OnCalendar=*-*-* *:15:00
Persistent=true
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now going-labs.timer >/dev/null
echo
echo "Done. The labs run every hour at :15."
echo "  Run now and watch:   systemctl start going-labs && journalctl -u going-labs -f"
echo "  Edit settings:       nano /opt/going/labs.conf"
echo "  Next scheduled run:  systemctl list-timers going-labs.timer"
