// bestia.js
// Modulo de comportamiento "bestia salvaje" para un bot de mineflayer.
// Requiere: npm install mineflayer-armor-manager mineflayer-pvp mineflayer-collectblock --save
//
// Uso: en tu index.js principal, despues de crear el bot, llama:
//   const bestia = require('./bestia.js');
//   bestia(bot);

const armorManager = require('mineflayer-armor-manager');
const { pvp } = require('mineflayer-pvp');
const collectBlock = require('mineflayer-collectblock').plugin;

// Ranking de armas por dano (de mejor a peor) - ajusta segun tu version de MC
const ARMAS_RANKING = [
  'netherite_sword', 'diamond_sword', 'iron_sword',
  'stone_sword', 'golden_sword', 'wooden_sword',
  'netherite_axe', 'diamond_axe', 'iron_axe'
];

// Umbral de vida para huir/curarse en vez de pelear
const VIDA_CRITICA = 6; // 3 corazones
const VIDA_SEGURA = 14;

function bestia(bot) {
  bot.loadPlugin(armorManager);
  bot.loadPlugin(pvp);
  bot.loadPlugin(collectBlock);

  // ---- 1. Equipar la mejor arma disponible ----
  function equiparMejorArma() {
    const inventario = bot.inventory.items();
    for (const nombreArma of ARMAS_RANKING) {
      const arma = inventario.find(item => item.name === nombreArma);
      if (arma) {
        bot.equip(arma, 'hand').catch(() => {});
        return;
      }
    }
  }

  // ---- 2. Armadura: mineflayer-armor-manager ya la maneja sola ----
  // equipMuchBetterArmor() se llama automaticamente al recoger items,
  // pero forzamos una pasada cada cierto tiempo tambien.
  setInterval(() => {
    if (bot.armorManager) bot.armorManager.equipAll();
    equiparMejorArma();
  }, 5000);

  // ---- 3. Nunca morir: monitorea vida y huye/come si esta critica ----
  bot.on('health', () => {
    if (bot.health <= VIDA_CRITICA) {
      // Detener el ataque y huir del enemigo mas cercano
      bot.pvp.stop();
      const entidad = bot.nearestEntity(e => e.type === 'mob' || e.type === 'hostile');
      if (entidad) {
        const direccionOpuesta = bot.entity.position.minus(entidad.position).normalize().scale(5);
        const destino = bot.entity.position.plus(direccionOpuesta);
        bot.pathfinder && bot.pathfinder.setGoal &&
          bot.pathfinder.setGoal(new (require('mineflayer-pathfinder').goals.GoalNear)(destino.x, destino.y, destino.z, 1));
      }
      // Comer si hay comida
      const comida = bot.inventory.items().find(item =>
        ['cooked_beef', 'bread', 'golden_apple', 'cooked_porkchop', 'apple'].includes(item.name)
      );
      if (comida) {
        bot.equip(comida, 'hand').then(() => bot.consume()).catch(() => {});
      }
    } else if (bot.health >= VIDA_SEGURA) {
      // Vida segura, retoma modo agresivo
      atacarHostilesCercanos();
    }
  });

  // ---- 4. Atacar hostiles cercanos ----
  function atacarHostilesCercanos() {
    const objetivo = bot.nearestEntity(e =>
      e.type === 'hostile' || e.type === 'mob'
    );
    if (objetivo && bot.health > VIDA_CRITICA) {
      equiparMejorArma();
      bot.pvp.attack(objetivo);
    }
  }
  setInterval(atacarHostilesCercanos, 2000);

  // ---- 5. Saquear cofres cercanos ----
  async function saquearCofreCercano() {
    const cofre = bot.findBlock({
      matching: block => block.name === 'chest' || block.name === 'trapped_chest',
      maxDistance: 6
    });
    if (!cofre) return;
    try {
      const contenedor = await bot.openContainer(cofre);
      const items = contenedor.containerItems();
      for (const item of items) {
        await contenedor.withdraw(item.type, null, item.count).catch(() => {});
      }
      contenedor.close();
    } catch (e) {
      // cofre ocupado o fuera de alcance, ignoramos
    }
  }
  setInterval(saquearCofreCercano, 15000);

  // ---- 6. Recoger drops de mobs (items en el suelo) cerca ----
  function recogerDropsCercanos() {
    const drop = bot.nearestEntity(e => e.name === 'item');
    if (drop && bot.entity.position.distanceTo(drop.position) < 10) {
      bot.collectBlock && bot.collectBlock.collect(drop, err => {});
    }
  }
  setInterval(recogerDropsCercanos, 3000);

  console.log('[bestia.js] Modo bestia salvaje activado: ataca, se equipa, saquea y no muere.');
}

module.exports = bestia;
