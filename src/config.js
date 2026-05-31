(function() {
  'use strict';

  window.CONFIG = Object.freeze({
    game: {
      name: '蛇渊回廊',
      version: '0.1.0',
      cols: 19,
      rows: 25,
      baseTickMs: 190,
      minTickMs: 110,
      initialHp: 3,
      initialLength: 4,
      invulnerableMs: 650,
      upgradeCooldownMs: 800,
      swipeMinPx: 22,
      storageKey: 'serpentRogueRecords'
    },
    colors: {
      background: '#16141d',
      grid: 'rgba(255,232,190,0.075)',
      snake: '#63d471',
      snakeDark: '#26734d',
      head: '#ffd166',
      core: '#8ff3ff',
      coreHot: '#facc15',
      enemy: '#fb4d5d',
      enemyDark: '#8f1d34',
      obstacle: '#6d5d86',
      obstacleEdge: '#d8b4fe',
      venom: 'rgba(52,211,153,0.28)',
      exit: '#61dafb',
      text: '#fff7df'
    },
    floor: {
      baseTargetCores: 4,
      maxTargetCores: 6,
      baseObstacles: 8,
      baseEnemies: 2,
      spawnEnemyEveryCores: 4
    },
    score: {
      core: 120,
      floor: 500,
      enemy: 80,
      length: 8
    },
    upgrades: [
      {
        id: 'venom',
        name: '毒迹',
        kind: '攻击',
        desc: '尾部留下毒迹 4 拍，敌人踩中会被清除。',
        max: 3
      },
      {
        id: 'scale',
        name: '钢鳞',
        kind: '生存',
        desc: '最大 HP +1，并立刻治疗 1 点。',
        max: 4
      },
      {
        id: 'speed',
        name: '疾行',
        kind: '辅助',
        desc: '移动节拍 -12ms，越快越危险也越灵活。',
        max: 5
      },
      {
        id: 'magnet',
        name: '磁舌',
        kind: '辅助',
        desc: '自动吸收周围核心，范围随等级提高。',
        max: 3
      },
      {
        id: 'fang',
        name: '裂牙',
        kind: '攻击',
        desc: '吞核心时清除蛇头周围 1 格敌人。',
        max: 2
      },
      {
        id: 'shed',
        name: '蜕皮',
        kind: '生存',
        desc: '每层首次致命伤改为保命，并损失 3 节身体。',
        max: 2
      },
      {
        id: 'glutton',
        name: '贪食',
        kind: '终极',
        desc: '核心得分 +25%，但每层额外生成敌人。',
        max: 3
      }
    ],
    lines: {
      start: '回廊醒了。',
      exit: '蛇门张开。',
      hurt: '鳞片碎裂。',
      death: '回廊记住了这条路径。',
      record: '这一次，黑暗晚了一步。'
    }
  });
})();
