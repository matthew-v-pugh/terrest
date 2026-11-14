// The game state of one table (one Discord activity instance). It lives inside
// a Durable Object (see worker.js), which stores it and hands it sockets. It owns the game state and
// pushes a per-member view after every change (hidden rolls, pocketed items and
// private log lines are redacted for everyone except the owner and storyteller;
// private chat messages reach only their sender and recipients).
import {
  BACKGROUNDS, DEFAULT_PLAYER_CONTROLS, DICE, PLAYER_COLORS, PLAYER_CONTROLS, TABLE_PRESETS,
} from '../shared/presets.js';
import { diffCharacter } from './diff.js';
import { randomInt, randomUUID } from './random.js';
import {
  GameError, clampInt, obj, sanitizeCharacter, sanitizeConfig, sanitizeControls, sanitizeScene,
  sanitizeSceneBackground, sanitizeSceneTable, str,
} from './validate.js';

const MAX_LOG = 150;
const ROLL_COOLDOWN_MS = 400;
const MAX_CHAT_CHARS = 300;
// At most CHAT_BURST messages per CHAT_WINDOW_MS from one person.
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 5000;
// Every scene upload is pushed to every member, so cap how often they can come.
const SCENE_UPLOAD_LIMIT = 6;
const SCENE_UPLOAD_WINDOW_MS = 60 * 1000;

const newMember = (fields) => ({ ...fields, sockets: new Set(), lastRoll: 0, chatTimes: [] });

export class Room {
  constructor(id) {
    this.id = id;
    this.members = new Map();
    this.storytellerId = null;
    this.config = null;
    this.controls = { ...DEFAULT_PLAYER_CONTROLS };
    // { background, table }, each a preset or an uploaded image. Sent in its own
    // 'scene' message so large uploads aren't resent with every state update.
    this.scene = null;
    this.sceneUploads = []; // timestamps of recent scene uploads, for rate limiting
    this.log = []; // rolls, events and chat, oldest first
  }

  // Storable state, split so no single stored value gets large: uploaded
  // portraits live with their member, uploaded scene images in `scene`.
  // Sockets and rate-limit timers are left out.
  serialize() {
    return {
      meta: {
        id: this.id, storytellerId: this.storytellerId, config: this.config, controls: this.controls, log: this.log,
      },
      scene: this.scene,
      members: [...this.members.values()].map(({
        sockets, lastRoll, chatTimes, ...m
      }) => m),
    };
  }

  static restore({ meta, scene, members }) {
    const room = new Room(meta.id);
    Object.assign(room, {
      storytellerId: meta.storytellerId, config: meta.config, controls: meta.controls, log: meta.log, scene: scene ?? null,
    });
    for (const m of members) room.members.set(m.id, newMember(m));
    return room;
  }

  hasOnline() {
    return [...this.members.values()].some((m) => m.sockets.size);
  }

  connect(user, ws) {
    let m = this.members.get(user.id);
    if (!m) {
      m = newMember({ id: user.id, color: this.pickColor(), role: null, character: null });
      this.members.set(user.id, m);
    }
    m.username = user.username;
    m.avatar = user.avatar;
    m.sockets.add(ws);
    ws.send(JSON.stringify({ type: 'scene', scene: this.scene }));
    this.broadcast();
  }

  disconnect(userId, ws) {
    const m = this.members.get(userId);
    if (!m) return;
    m.sockets.delete(ws);
    // Members who never picked a role have nothing worth keeping around.
    if (!m.sockets.size && !m.role && !m.character) this.members.delete(userId);
    this.broadcast();
  }

  handle(userId, msg) {
    const handler = Object.hasOwn(handlers, msg?.type) && handlers[msg.type];
    if (!handler) throw new GameError('Unknown action.');
    handler(this, this.members.get(userId), msg);
    this.broadcast();
  }

  pickColor() {
    const used = new Set([...this.members.values()].map((m) => m.color));
    const free = PLAYER_COLORS.find((c) => !used.has(c));
    if (free) return free;
    // Palette exhausted: spread extra hues by the golden angle so they stay distinct.
    return `hsl(${Math.round((used.size * 137.508) % 360)} 55% 32%)`;
  }

  isOnline(userId) {
    return !!this.members.get(userId)?.sockets.size;
  }

  // `lines` are strings (public) or { text, private } from diffCharacter.
  addEvent(actorId, lines, targetId = null) {
    const normalized = lines.map((l) => (typeof l === 'string' ? { text: l, private: false } : l));
    if (!normalized.length) return;
    this.pushLog({ id: randomUUID(), kind: 'event', actorId, targetId, lines: normalized, ts: Date.now() });
  }

  pushLog(entry) {
    this.log.push(entry);
    if (this.log.length > MAX_LOG) this.log.shift();
  }

  view(forUserId) {
    const isStoryteller = forUserId === this.storytellerId;
    return {
      id: this.id,
      storytellerId: this.storytellerId,
      config: this.config,
      controls: this.controls,
      members: [...this.members.values()].map((m) => ({
        id: m.id,
        username: m.username,
        avatar: m.avatar,
        color: m.color,
        role: m.role,
        online: m.sockets.size > 0,
        character: m.id === forUserId || isStoryteller ? m.character : publicCharacter(m.character),
      })),
      log: this.log.flatMap((e) => {
        if (e.kind === 'chat') {
          return !e.to || e.userId === forUserId || e.to.includes(forUserId) ? [e] : [];
        }
        if (e.kind === 'roll') {
          return [e.hidden && !e.revealed && !isStoryteller
            ? { id: e.id, kind: 'roll', userId: e.userId, ts: e.ts, secret: true }
            : e];
        }
        if (isStoryteller || e.targetId === forUserId) return [e];
        const lines = e.lines.filter((l) => !l.private);
        return lines.length ? [{ ...e, lines }] : [];
      }),
    };
  }

  broadcast() {
    for (const m of this.members.values()) {
      if (!m.sockets.size) continue;
      const payload = JSON.stringify({ type: 'state', you: m.id, room: this.view(m.id) });
      for (const ws of m.sockets) if (ws.readyState === 1) ws.send(payload);
    }
  }

  // Call before storing a scene with `count` newly uploaded images.
  checkUploadRate(count) {
    if (!count) return;
    const now = Date.now();
    this.sceneUploads = this.sceneUploads.filter((t) => now - t < SCENE_UPLOAD_WINDOW_MS);
    if (this.sceneUploads.length + count > SCENE_UPLOAD_LIMIT) {
      throw new GameError('Too many image uploads. Wait a minute and try again.');
    }
    for (let i = 0; i < count; i++) this.sceneUploads.push(now);
  }

  updateScene(scene) {
    this.scene = scene;
    const payload = JSON.stringify({ type: 'scene', scene });
    for (const m of this.members.values()) {
      for (const ws of m.sockets) if (ws.readyState === 1) ws.send(payload);
    }
  }
}

function describeLayer(layer, presets, noun) {
  return layer.type === 'upload'
    ? `uploaded a custom ${noun}`
    : `changed the ${noun} to ${presets.find((p) => p.id === layer.id).label}`;
}

// Pocketed (hidden) items are only sent to their owner and the storyteller.
function publicCharacter(c) {
  if (!c) return c;
  return {
    ...c,
    equipment: Object.fromEntries(Object.entries(c.equipment).map(([slot, item]) => [slot, item?.hidden ? null : item])),
    inventory: c.inventory.filter((item) => !item.hidden),
  };
}

function requireStoryteller(room, me) {
  if (room.storytellerId !== me.id) throw new GameError('Only the storyteller can do that.');
}

function requireConfig(room) {
  if (!room.config) throw new GameError('The storyteller has not set up the game yet.');
}

function requireOwnCharacter(me) {
  if (me.role !== 'player' || !me.character) throw new GameError('You have no character at this table.');
}

function findItem(character, itemId) {
  return character.inventory.find((i) => i.id === itemId)
    || Object.values(character.equipment).find((i) => i?.id === itemId);
}

const handlers = {
  chooseRole(room, me, { role }) {
    if (role === 'storyteller') {
      const current = room.storytellerId;
      if (current && current !== me.id) {
        if (room.isOnline(current)) throw new GameError('This table already has a storyteller.');
        // The previous storyteller left; whoever claims the role takes over.
        room.members.get(current).role = null;
      }
      room.storytellerId = me.id;
      me.role = 'storyteller';
    } else if (role === 'player') {
      if (room.storytellerId === me.id) room.storytellerId = null;
      me.role = 'player';
    } else {
      throw new GameError('Unknown role.');
    }
  },

  releaseRole(room, me) {
    if (room.storytellerId === me.id) room.storytellerId = null;
    me.role = null;
  },

  setupGame(room, me, { config, scene, controls }) {
    requireStoryteller(room, me);
    if (room.config) throw new GameError('The game is already set up. Reset it first.');
    const nextScene = sanitizeScene(scene);
    room.checkUploadRate([nextScene.background, nextScene.table].filter((l) => l.type === 'upload').length);
    room.config = sanitizeConfig(config);
    room.controls = sanitizeControls(controls);
    room.updateScene(nextScene);
    for (const m of room.members.values()) m.character = null;
    room.addEvent(me.id, ['opened the table']);
  },

  resetGame(room, me) {
    requireStoryteller(room, me);
    room.config = null;
    room.updateScene(null);
    room.controls = { ...DEFAULT_PLAYER_CONTROLS };
    room.log = [];
    for (const m of room.members.values()) m.character = null;
  },

  // Either layer may be omitted to leave it unchanged.
  setScene(room, me, msg) {
    requireStoryteller(room, me);
    requireConfig(room);
    const input = obj(msg.scene);
    const next = { ...room.scene };
    const lines = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if ('background' in input) {
      next.background = sanitizeSceneBackground(input.background);
      if (!same(next.background, room.scene.background)) lines.push(describeLayer(next.background, BACKGROUNDS, 'background'));
    }
    if ('table' in input) {
      next.table = sanitizeSceneTable(input.table, next.background);
      if (!same(next.table, room.scene.table)) lines.push(describeLayer(next.table, TABLE_PRESETS, 'table'));
    }
    if (!lines.length) return;
    const isNewUpload = (layer, before) => layer.type === 'upload' && !same(layer, before);
    room.checkUploadRate(Number(isNewUpload(next.background, room.scene.background)) + Number(isNewUpload(next.table, room.scene.table)));
    room.updateScene(next);
    room.addEvent(me.id, lines);
  },

  setPlayerControls(room, me, { controls }) {
    requireStoryteller(room, me);
    const next = sanitizeControls(controls);
    const changed = PLAYER_CONTROLS.filter((c) => next[c.id] !== room.controls[c.id]);
    room.controls = next;
    room.addEvent(me.id, changed.map((c) => `${next[c.id] ? 'let players control' : 'took back control of'} ${c.label.toLowerCase()}`));
  },

  saveCharacter(room, me, { character }) {
    requireConfig(room);
    if (me.role !== 'player') throw new GameError('Only players create characters.');
    if (me.character) throw new GameError('You already have a character.');
    me.character = sanitizeCharacter(character, room.config, false);
    room.addEvent(me.id, [`took a seat as ${me.character.name}`]);
  },

  editCharacter(room, me, { userId, character }) {
    requireStoryteller(room, me);
    requireConfig(room);
    const target = room.members.get(userId);
    if (!target?.character) throw new GameError('That player has no character.');
    const next = sanitizeCharacter(character, room.config, true);
    room.addEvent(me.id, diffCharacter(target.character, next, room.config), userId);
    target.character = next;
  },

  // A player editing their own sheet: only the parts the storyteller has
  // opened up are taken from the input; everything else stays as it was.
  editOwnCharacter(room, me, { character }) {
    requireConfig(room);
    requireOwnCharacter(me);
    const { config, controls } = room;
    const before = me.character;
    const input = sanitizeCharacter(character, config, true);
    const next = structuredClone(before);

    if (controls.identity) {
      next.name = input.name;
      next.portrait = input.portrait;
    }
    if (controls.stats) {
      for (const s of config.stats) {
        if (input.stats[s] !== before.stats[s]) next.stats[s] = clampInt(input.stats[s], config.statMin, config.statMax, before.stats[s]);
      }
    }
    if (controls.resources) {
      for (const r of config.resources) {
        const res = next.resources[r.id];
        if (res) res.current = clampInt(input.resources[r.id]?.current, 0, res.max, res.current);
      }
    }
    if (controls.items) {
      // Without pocketing rights, existing items keep their visibility and new ones are visible.
      const keepVisibility = (item) => {
        if (!item || controls.pocket) return item;
        return { ...item, hidden: !!findItem(before, item.id)?.hidden };
      };
      next.equipment = Object.fromEntries(Object.entries(input.equipment).map(([slot, item]) => [slot, keepVisibility(item)]));
      next.inventory = input.inventory.map(keepVisibility);
    }

    const lines = diffCharacter(before, next, config);
    if (!lines.length) return;
    me.character = next;
    room.addEvent(me.id, lines, me.id);
  },

  setItemVisibility(room, me, { itemId, hidden }) {
    requireOwnCharacter(me);
    if (!room.controls.pocket) throw new GameError('The storyteller has locked pocketing.');
    const item = findItem(me.character, itemId);
    if (!item) throw new GameError('Item not found.');
    if (item.hidden === !!hidden) return;
    item.hidden = !!hidden;
    room.addEvent(me.id, [`${item.hidden ? 'pocketed' : 'revealed'} ${item.name}`], me.id);
  },

  removeCharacter(room, me, { userId }) {
    requireStoryteller(room, me);
    const target = room.members.get(userId);
    if (!target?.character) return;
    room.addEvent(me.id, [`removed ${target.character.name} from the table`]);
    target.character = null;
  },

  refreshRenewables(room, me) {
    requireStoryteller(room, me);
    requireConfig(room);
    const renewable = room.config.resources.filter((r) => r.renewable);
    for (const m of room.members.values()) {
      if (!m.character) continue;
      for (const r of renewable) {
        const res = m.character.resources[r.id];
        if (res) res.current = res.max;
      }
    }
    room.addEvent(me.id, [`called a rest: ${renewable.map((r) => r.name).join(', ')} refilled`]);
  },

  roll(room, me, msg) {
    if (!me.role) throw new GameError('Pick a role first.');
    const now = Date.now();
    if (now - me.lastRoll < ROLL_COOLDOWN_MS) return;
    me.lastRoll = now;

    const sides = Number(msg.sides);
    if (!DICE.includes(sides)) throw new GameError('Unknown die.');
    const count = clampInt(msg.count, 1, 20, 1);
    const modifier = clampInt(msg.modifier, -99, 99, 0);
    const results = Array.from({ length: count }, () => randomInt(1, sides + 1));
    room.pushLog({
      id: randomUUID(),
      kind: 'roll',
      userId: me.id,
      sides,
      count,
      modifier,
      results,
      total: results.reduce((a, b) => a + b, 0) + modifier,
      label: str(msg.label, 40),
      hidden: room.storytellerId === me.id && !!msg.hidden,
      revealed: false,
      ts: now,
    });
  },

  // `to` is a list of member ids for a private message; omit it to talk to everyone.
  chat(room, me, msg) {
    if (!me.role) throw new GameError('Pick a role first.');
    const text = str(msg.text, MAX_CHAT_CHARS);
    if (!text) return;

    let to = null;
    if (Array.isArray(msg.to)) {
      to = [...new Set(msg.to)].filter((id) => typeof id === 'string' && id !== me.id && room.members.get(id)?.role);
      if (!to.length) throw new GameError('Pick at least one person to message.');
    }

    const now = Date.now();
    me.chatTimes = me.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
    if (me.chatTimes.length >= CHAT_BURST) throw new GameError('You are sending messages too quickly.');
    me.chatTimes.push(now);

    room.pushLog({ id: randomUUID(), kind: 'chat', userId: me.id, to, text, ts: now });
  },

  revealRoll(room, me, { rollId }) {
    requireStoryteller(room, me);
    const roll = room.log.find((e) => e.kind === 'roll' && e.id === rollId);
    if (roll) roll.revealed = true;
  },
};
