// SkyForge — config: tuning constants, aircraft roster, tech-tree parts, missions, medals.
export const CFG = {
  W: 960, H: 640,
  // flight model
  GRAVITY: 22, LIFT_K: 0.92, DRAG: 0.0018, INDUCED_DRAG: 0.02,
  MAX_THROTTLE: 1.0, THROTTLE_RATE: 0.55, STALL_SPEED: 34,
  PITCH_RATE: 1.25, ROLL_RATE: 2.4, YAW_RATE: 0.55,
  G_LIMIT: 9, WING_LOAD_REF: 62,
  // world
  TERRAIN_SIZE: 9000, GRID: 96, SEA_LEVEL: 0,
  VIEW_DIST: 2600, FOV: 1.05,
  // fuel & damage
  FUEL_BURN: 0.9, FUEL_WARN: 0.25, MAX_DAMAGE: 100,
  CRASH_SPEED: 55, HARD_G: 8.2,
  // combat
  MISSILE_SPEED: 340, MISSILE_LIFE: 6, FLARE_COOLDOWN: 4, GUN_RATE: 9,
  // progression
  XP_PER_LANDING: 120, XP_PER_RING: 15, XP_PER_KILL: 220,
  XP_PER_MISSION: {race: 200, cargo: 240, intercept: 320, patrol: 150, escort: 280, night: 260, free: 40},
  SAVE_KEY: 'skyforge.save.v2',
  // day/night cycle (seconds of real time for a full cycle in free flight)
  DAY_CYCLE: 420,
};

// Aircraft roster — 8 airframes across 3 classes. Parts bolt on per-slot.
export const AIRFRAMES = [
  { id: 'sparrow',  name: 'SPARROW MK-I',   cls: 'trainer', cost: 0,    mass: 1.0,  thrust: 1.0,  agility: 1.0,  stall: 34, hp: 100, fuel: 100,
    desc: 'Trainer. Forgiving, slow, honest.', shape: 'straight', color: '#5f8fd9', tier: 1 },
  { id: 'wren',     name: 'WREN L-2',       cls: 'trainer', cost: 450,  mass: 0.9,  thrust: 1.05, agility: 1.12, stall: 32, hp: 95,  fuel: 110,
    desc: 'Twitchy club racer. Cheap thrills.', shape: 'straight', color: '#7bc98f', tier: 1 },
  { id: 'kestrel',  name: 'KESTREL MK-II',  cls: 'fighter', cost: 900,  mass: 0.85, thrust: 1.25, agility: 1.3,  stall: 30, hp: 90,  fuel: 105,
    desc: 'Light fighter. Rolls on a coin.', shape: 'delta', color: '#d9a441', tier: 2 },
  { id: 'sabre',    name: 'SABRE F-7',      cls: 'fighter', cost: 1700, mass: 0.95, thrust: 1.45, agility: 1.22, stall: 32, hp: 110, fuel: 120,
    desc: 'Gunfighter. BUILT for the merge.', shape: 'swept', color: '#c96f3f', tier: 2 },
  { id: 'heron',    name: 'HERON CARGO',    cls: 'heavy',   cost: 1200, mass: 1.6,  thrust: 1.15, agility: 0.7,  stall: 42, hp: 160, fuel: 160,
    desc: 'Heavy lifter. Eats turbulence.', shape: 'wide', color: '#4fae7c', tier: 2 },
  { id: 'manta',    name: 'MANTA H-4',      cls: 'heavy',   cost: 2100, mass: 1.45, thrust: 1.3,  agility: 0.85, stall: 38, hp: 190, fuel: 150,
    desc: 'Flying wing hauler. Ghost on radar.', shape: 'wing', color: '#5a6f8f', tier: 3 },
  { id: 'vortex',   name: 'VORTEX X-9',     cls: 'fighter', cost: 2600, mass: 0.78, thrust: 1.75, agility: 1.55, stall: 36, hp: 80,  fuel: 95,
    desc: 'Prototype. Do not look down.', shape: 'swept', color: '#c4526b', tier: 3 },
  { id: 'aurora',   name: 'AURORA Z-1',     cls: 'prototype', cost: 4800, mass: 0.7, thrust: 2.0, agility: 1.7,  stall: 34, hp: 70, fuel: 90,
    desc: 'Scramjet demo airframe. The sky bends.', shape: 'dart', color: '#9a6fd9', tier: 4 },
];

// Tech-tree parts: tier-gated, need the tier-1 part in the slot first.
export const UPGRADES = [
  // WINGS
  { id: 'wing-foil',  name: 'Laminar Wingfoil',  slot: 'wings', tier: 1, cost: 500,  lift: 1.12, agility: 1.05,
    desc: 'Smaller stall margin, tighter turns.' },
  { id: 'wing-gull',  name: 'Gull-Taper Wings',  slot: 'wings', tier: 2, cost: 850,  lift: 1.22, agility: 0.92, drag: 0.92, needs: 'wing-foil',
    desc: 'Soars on thin throttle. Sluggish roll.' },
  { id: 'wing-delta', name: 'Cropped Delta',     slot: 'wings', tier: 2, cost: 1100, lift: 0.95, agility: 1.35, stall: 4, needs: 'wing-foil',
    desc: 'Knife-edge agility, bites at low speed.' },
  { id: 'wing-grid',  name: 'Grid Fin Canards',  slot: 'wings', tier: 3, cost: 2400, agility: 1.5, drag: 1.08, stall: 2, needs: 'wing-delta',
    desc: 'Post-stall control. Draggy witchcraft.' },
  // ENGINE
  { id: 'eng-super',  name: 'Supercharger',      slot: 'engine', tier: 1, cost: 700,  thrust: 1.18, burn: 1.1,
    desc: 'More push, more thirst.' },
  { id: 'eng-turbo',  name: 'Turbofan Core',     slot: 'engine', tier: 2, cost: 1400, thrust: 1.32, burn: 0.9, needs: 'eng-super',
    desc: 'Lean burn cruise beast.' },
  { id: 'eng-rocket', name: 'Aux Rocket Pod',    slot: 'engine', tier: 3, cost: 2200, thrust: 1.6,  burn: 1.45, needs: 'eng-turbo',
    desc: 'For intercepts and regrets.' },
  { id: 'eng-scram',  name: 'Scramjet Spike',    slot: 'engine', tier: 4, cost: 4200, thrust: 1.9,  burn: 1.2, drag: 0.95, needs: 'eng-rocket',
    desc: 'Lights up past 300 kts. Barely idle below.' },
  // ARMOR
  { id: 'arm-plate',  name: 'Boron Plating',     slot: 'armor', tier: 1, cost: 600,  hp: 40, drag: 1.05,
    desc: 'Bounces off ridges. Barely.' },
  { id: 'arm-self',   name: 'Self-Sealing Tanks', slot: 'armor', tier: 2, cost: 900,  leak: 0.35, needs: 'arm-plate',
    desc: 'Holes close. Fuel stays.' },
  { id: 'arm-tita',   name: 'Titanium Bathtub',  slot: 'armor', tier: 3, cost: 2000, hp: 80, leak: 0.5, drag: 1.06, needs: 'arm-self',
    desc: 'Walk-away mass. Everywhere else hurts.' },
  // AVIONICS (4th slot: targeting, flares, radar)
  { id: 'av-gun',     name: 'Lead-Computing Gun', slot: 'avionics', tier: 1, cost: 650, gun: 1.35,
    desc: 'Ace-grade firing solution. Faster guns.' },
  { id: 'av-flare',   name: 'Flare Dispenser',    slot: 'avionics', tier: 2, cost: 1000, flares: 6, needs: 'av-gun',
    desc: 'Six decoys. Missiles hate them.' },
  { id: 'av-lock',    name: 'Helmet Cueing',      slot: 'avionics', tier: 3, cost: 2300, lockCone: 1.6, needs: 'av-flare',
    desc: 'Look. Lock. Launch. Look smug.' },
];

export const MISSIONS = [
  { id: 'patrol',    name: 'ISLAND PATROL',   goal: 'Fly the ring chain, land home.',
    rings: 8,  cargo: 0,   reward: 180, spawns: 'chain',  foes: 0, unlock: null },
  { id: 'race',      name: 'CANYON RACE',     goal: 'Thread low canyons fast. G-limits apply.',
    rings: 14, cargo: 0,   reward: 300, spawns: 'canyon', foes: 0, unlock: {level: 2} },
  { id: 'cargo',     name: 'RELIEF CARGO',    goal: 'Haul heavy freight. Mind the stall.',
    rings: 6,  cargo: 900, reward: 320, spawns: 'flat',   foes: 0, unlock: {level: 2} },
  { id: 'intercept', name: 'STORM INTERCEPT', goal: 'Chase the storm cell — and the bandits in it.',
    rings: 10, cargo: 0,   reward: 420, spawns: 'storm',  foes: 3, unlock: {level: 3} },
  { id: 'escort',    name: 'CONVOY ESCORT',   goal: 'Shadow the transport. Splash anything hostile.',
    rings: 8,  cargo: 0,   reward: 460, spawns: 'escort', foes: 4, unlock: {level: 4} },
  { id: 'night',     name: 'NIGHT OPS',       goal: 'Moonless run. Terrain radar only.',
    rings: 9,  cargo: 0,   reward: 480, spawns: 'night',  foes: 2, unlock: {level: 5}, night: true },
  { id: 'ace',       name: 'ACE TRIAL',       goal: 'Five veterans. No respawn. Legends only.',
    rings: 6,  cargo: 0,   reward: 900, spawns: 'ace',    foes: 5, unlock: {level: 7}, aceSkill: 1.5 },
  { id: 'free',      name: 'FREE FLIGHT',     goal: 'Open sky. Day/night cycle. No stakes.',
    rings: 0,  cargo: 0,   reward: 0,   spawns: 'free',   foes: 0, unlock: null, free: true },
];

export const MEDALS = [
  { id: 'first-flight', name: 'WINGS',           desc: 'Complete your first sortie.' },
  { id: 'ace-5',        name: 'ACE',             desc: 'Down 5 bandits.' },
  { id: 'ace-25',       name: 'DOUBLE ACE',      desc: 'Down 25 bandits.' },
  { id: 'star-chaser',  name: 'STAR CHASER',     desc: 'Earn 15 total stars.' },
  { id: 'iron-butt',    name: 'IRON BUTT',       desc: 'Fly 30 minutes total.' },
  { id: 'ghost',        name: 'GHOST',           desc: 'Finish a combat sortie without damage.' },
  { id: 'aurora-pilot', name: 'EDGE OF THE SKY', desc: 'Own the AURORA Z-1.' },
  { id: 'night-owl',    name: 'NIGHT OWL',       desc: '3-star a night sortie.' },
  { id: 'stallion',     name: 'STALLION',        desc: 'Recover from a full stall.' },
  { id: 'flatliner',    name: 'FLATLINER',       desc: 'Pull 9.0G and survive.' },
];

export const RANKS = [
  'CADET', 'PILOT OFFICER', 'FLYING OFFICER', 'FLIGHT LIEUTENANT', 'SQUADRON LEADER',
  'WING COMMANDER', 'GROUP CAPTAIN', 'AIR COMMODORE', 'AIR MARSHAL', 'SKYFORGE LEGEND',
];

export const LIVERY_PALETTES = [
  { id: 'default',  name: 'Factory',      body: null,        trim: null },
  { id: 'shark',    name: 'Sharkmouth',   body: '#8f9aa6',   trim: '#e8e4d8' },
  { id: 'wasp',     name: 'Wasp',         body: '#e8c832',   trim: '#1a1a1a' },
  { id: 'arctic',   name: 'Arctic Flare', body: '#dfe8ee',   trim: '#3f8fd9' },
  { id: 'ember',    name: 'Ember',        body: '#b8402e',   trim: '#f2a23a' },
  { id: 'night',    name: 'Nightstalker', body: '#20242c',   trim: '#4fae7c' },
  { id: 'candy',    name: 'Candy Racer',  body: '#e05a9d',   trim: '#fff05a' },
  { id: 'gold',     name: 'Gold Flush',   body: '#d9b34a',   trim: '#fff6d0' },
];
