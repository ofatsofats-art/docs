'use strict';

const XP_STEPS = [0, 10, 25, 50, 75, 100, 250, 500, 750, 1000,
  1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 4500];

const STAR_CLASS = [
  { min: 90, cls: 'star-jade' },
  { min: 80, cls: 'star-topaz' },
  { min: 70, cls: 'star-opal' },
  { min: 60, cls: 'star-amethyst' },
  { min: 50, cls: 'star-crystal' },
  { min: 40, cls: 'star-ruby' },
  { min: 30, cls: 'star-diamond' },
  { min: 20, cls: 'star-gold' },
  { min: 10, cls: 'star-iron' },
  { min: 0, cls: 'star-stone' },
];

function starFromExp(exp) {
  let total = 0;
  for (let i = 0; i < XP_STEPS.length; i++) {
    total += XP_STEPS[i];
    if (exp < total) return i;
  }
  const level = XP_STEPS.length + Math.floor((exp - total) / 5000);
  return Math.min(level, 10000);
}

function parseLevelFromFormatted(lf) {
  let digits = '';
  for (let i = 0; i < lf.length; i++) {
    const c = lf.charCodeAt(i);
    if (c === 0xC2 && i + 2 < lf.length && lf.charCodeAt(i + 1) === 0xA7) {
      i += 2;
      continue;
    }
    if (c >= 48 && c <= 57) digits += lf[i];
  }
  return digits ? parseInt(digits, 10) : null;
}

function starClass(level) {
  for (const s of STAR_CLASS) {
    if (level >= s.min) return s.cls;
  }
  return 'star-stone';
}

function sumWins(sw) {
  if (sw.wins > 0) return sw.wins;
  return (sw.wins_solo_normal || 0) + (sw.wins_team_normal || 0) +
         (sw.wins_solo_insane || 0) + (sw.wins_team_insane || 0);
}

function sumLosses(sw) {
  return (sw.losses || 0) + (sw.losses_solo_normal || 0) + (sw.losses_team_normal || 0) +
         (sw.losses_solo_insane || 0) + (sw.losses_team_insane || 0);
}

function buildRank(player) {
  let rank = player.monthlyPackageRank || 'NONE';
  if (!rank || rank === 'NONE') {
    rank = player.newPackageRank || player.packageRank || player.rank || 'NONE';
  }
  const map = {
    MVP_PLUS_PLUS: '[MVP++]',
    MVP_PLUS: '[MVP+]',
    MVP: '[MVP]',
    VIP_PLUS: '[VIP+]',
    VIP: '[VIP]',
    YOUTUBER: '[YT]',
  };
  return map[rank] || '-';
}

function kdClass(kd) {
  if (kd >= 5) return 'bad';
  if (kd >= 2) return 'mid';
  return 'good';
}

function wlClass(wl) {
  if (wl >= 3) return 'bad';
  if (wl >= 1.5) return 'mid';
  return 'good';
}

async function mojangUuid(username) {
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`);
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error('Mojang lookup failed');
  const data = await res.json();
  return data.id || null;
}

async function hypixelPlayer(uuid, apiKey) {
  const res = await fetch(
    `https://api.hypixel.net/v2/player?uuid=${uuid}&key=${encodeURIComponent(apiKey)}`
  );
  const data = await res.json();
  if (!data.success) {
    const cause = data.cause || 'Unknown error';
    throw new Error(cause);
  }
  return data.player;
}

function parseSkyWars(player) {
  const sw = player?.stats?.SkyWars;
  if (!sw) return null;

  let exp = sw.skywars_experience ?? sw.exp ?? 0;
  let level = starFromExp(Math.floor(exp));

  if (sw.levelFormatted) {
    const parsed = parseLevelFromFormatted(sw.levelFormatted);
    if (parsed !== null) level = parsed;
  }

  const kills = sw.kills || 0;
  const deaths = sw.deaths || 0;
  const wins = sumWins(sw);
  const losses = sumLosses(sw);
  const fk = sw.final_kills || 0;
  const fd = sw.final_deaths || 0;

  return {
    level,
    kills,
    deaths,
    wins,
    losses,
    winStreak: sw.win_streak || 0,
    finalKills: fk,
    finalDeaths: fd,
    kdr: deaths > 0 ? kills / deaths : kills,
    wl: losses > 0 ? wins / losses : wins,
    fkd: fd > 0 ? fk / fd : fk,
  };
}

function setStatus(msg, isError, target = 'stats') {
  const id = target === 'bl' ? 'status-bl' : 'status';
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.className = target === 'bl' ? (isError ? 'error bl-status' : 'bl-status') : (isError ? 'error' : '');
}

function renderStats(username, player, sw) {
  const card = document.getElementById('stats-card');
  card.classList.add('visible');

  document.getElementById('player-name').textContent = player.displayname || username;
  document.getElementById('rank-tag').textContent = buildRank(player);

  const starEl = document.getElementById('star-display');
  starEl.textContent = `${sw.level}\u272F`;
  starEl.className = `star-display ${starClass(sw.level)}`;

  const set = (id, val, cls) => {
    const el = document.getElementById(id);
    el.textContent = val;
    el.className = `value${cls ? ' ' + cls : ''}`;
  };

  set('stat-kd', sw.kdr.toFixed(2), kdClass(sw.kdr));
  set('stat-wl', sw.wl.toFixed(2), wlClass(sw.wl));
  set('stat-wins', String(sw.wins), '');
  set('stat-losses', String(sw.losses), '');
  set('stat-kills', String(sw.kills), '');
  set('stat-deaths', String(sw.deaths), '');
  set('stat-streak', String(sw.winStreak), sw.winStreak >= 5 ? 'good' : '');
  set('stat-fkd', sw.fkd.toFixed(2), kdClass(sw.fkd));
}

async function lookupPlayer() {
  const username = document.getElementById('username').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();

  if (!username) {
    setStatus('Enter a Minecraft username.', true);
    return;
  }
  if (!apiKey) {
    setStatus('Enter your Hypixel API key (stored only in your browser).', true);
    return;
  }

  localStorage.setItem('lunar_api_key', apiKey);

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  setStatus('Looking up player…');
  document.getElementById('stats-card').classList.remove('visible');

  try {
    const uuid = await mojangUuid(username);
    if (!uuid) {
      setStatus('Player not found on Mojang.', true);
      return;
    }

    const player = await hypixelPlayer(uuid, apiKey);
    if (!player) {
      setStatus('Player has never joined Hypixel.', true);
      return;
    }

    const sw = parseSkyWars(player);
    if (!sw) {
      setStatus('No SkyWars stats for this player.', true);
      return;
    }

    renderStats(username, player, sw);
    setStatus('');
  } catch (e) {
    setStatus(e.message || 'Request failed', true);
  } finally {
    btn.disabled = false;
  }
}

async function loadBlacklist() {
  const url = document.getElementById('gist-url').value.trim();
  if (!url) {
    setStatus('Paste your gist raw URL first.', true, 'bl');
    return;
  }

  localStorage.setItem('lunar_gist_url', url);
  setStatus('Loading blacklist…', false, 'bl');

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];

    const tbody = document.getElementById('blacklist-body');
    tbody.innerHTML = '';

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">Empty list</td></tr>';
    } else {
      for (const e of entries) {
        const tr = document.createElement('tr');
        const tagCls = e.tag === 'cheater' ? 'tag-cheater' : '';
        tr.innerHTML = `
          <td>${escapeHtml(e.name)}</td>
          <td class="${tagCls}">${escapeHtml(e.tag || '-')}</td>
          <td>${escapeHtml(e.reason || '')}</td>
          <td>${escapeHtml(e.addedBy || '')}</td>`;
        tbody.appendChild(tr);
      }
    }

    setStatus(`${entries.length} entries loaded.`, false, 'bl');
  } catch (e) {
    setStatus('Failed to load gist: ' + e.message, true, 'bl');
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.panel;
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(id).classList.add('active');
      setStatus('', false, 'stats');
      setStatus('', false, 'bl');
    });
  });
}

function init() {
  initTabs();

  const savedKey = localStorage.getItem('lunar_api_key');
  if (savedKey) document.getElementById('api-key').value = savedKey;

  const savedGist = localStorage.getItem('lunar_gist_url');
  if (savedGist) document.getElementById('gist-url').value = savedGist;

  document.getElementById('search-btn').addEventListener('click', lookupPlayer);
  document.getElementById('username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookupPlayer();
  });
  document.getElementById('load-bl').addEventListener('click', loadBlacklist);
}

document.addEventListener('DOMContentLoaded', init);
