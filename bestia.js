// Modulo de comportamiento "bestia salvaje" para un bot de mineflayer.
// Requiere: npm install mineflayer-armor-manager mineflayer-pvp mineflayer-collectblock --save

const armorManager = require('mineflayer-armor-manager');
const { pvp } = require('mineflayer-pvp');
const collectBlock = require('mineflayer-collectblock').plugin;

// Ranking de armas por daño (de mejor a peor) - ajusta segun tu version de MC
const ARMAS_RANKING = [
  'netherite_sword', 'diamond_sword', 'iron_sword',
  'stone_sword', 'golden_sword', 'wooden_sword',
  'netherite_axe', 'diamond_axe', 'iron_axe'
];

// Umbral de vida para huir/curarse en vez de pelear
const VIDA_CRITICA = 6; // 3 corazones
const VIDA_SEGURA = 14; // 7 corazones

function bestia(bot) {
  // Cargar plugins necesarios
  bot.loadPlugin(armorManager);
  bot.loadPlugin(pvp);
  bot.loadPlugin(collectBlock);

  // ---- CONTROL DE BUCLES (Evita lag cuando el bot se reconecta) ----
  const buclesActivos = [];
  function crearBucle(funcion, tiempo) {
    const id = setInterval(funcion, tiempo);
    buclesActivos.push(id);
  }

  // Si el bot se desconecta, detenemos los bucles de la bestia para no consumir RAM
  bot.once('end', () => {
    buclesActivos.forEach(clearInterval);
  });

  // ---- 1. Equipar la mejor arma disponible ----
  function equiparMejorArma() {
    if (!bot || !bot.inventory) return;
    const inventario = bot.inventory.items();
    for (const nombreArma of ARMAS_RANKING) {
      const arma = inventario.find(item => item.name === nombreArma);
      if (arma) {
        bot.equip(arma, 'hand').catch(() => {});
        return;
      }
    }
  }

  // ---- 2. Armadura: equipamiento automático ----
  crearBucle(() => {
    if (bot && bot.armorManager) {
      bot.armorManager.equipAll().catch(() => {});
    }
    equiparMejorArma();
  }, 5000);

  // ---- 3. Nunca morir: monitorea vida y huye/come si esta critica ----
  bot.on('health', () => {
    if (!bot || !bot.entity) return;

    if (bot.health <= VIDA_CRITICA) {
      // Detener el ataque
      if (bot.pvp && bot.pvp.stop) bot.pvp.stop();
      
      // Huir del enemigo mas cercano
      const entidad = bot.nearestEntity(e => e.type === 'mob' || e.type === 'hostile');
      if (entidad) {
        const direccionOpuesta = bot.entity.position.minus(entidad.position).normalize().scale(5);
        const destino = bot.entity.position.plus(direccionOpuesta);
        if (bot.pathfinder && bot.pathfinder.setGoal) {
          const { goals } = require('mineflayer-pathfinder');
          bot.pathfinder.setGoal(new goals.GoalNear(destino.x, destino.y, destino.z, 1));
        }
      }
      
      // Comer si hay comida
      if (bot.inventory) {
        const comida = bot.inventory.items().find(item =>
          ['cooked_beef', 'bread', 'golden_apple', 'cooked_porkchop', 'apple'].includes(item.name)
        );
        if (comida) {
          bot.equip(comida, 'hand').then(() => bot.consume()).catch(() => {});
        }
      }
    } else if (bot.health >= VIDA_SEGURA) {
      // Vida segura, retoma modo agresivo
      atacarHostilesCercanos();
    }
  });

  // ---- 4. Atacar hostiles cercanos ----
  function atacarHostilesCercanos() {
    if (!bot || !bot.entity || bot.health <= VIDA_CRITICA) return;
    const objetivo = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'mob');
    if (objetivo) {
      equiparMejorArma();
      if (bot.pvp) bot.pvp.attack(objetivo);
    }
  }
  crearBucle(atacarHostilesCercanos, 2000);

  // ---- 5. Saquear cofres cercanos ----
  async function saquearCofreCercano() {
    if (!bot || !bot.entity) return;
    const cofreBlock = bot.findBlock({
      matching: block => block.name === 'chest' || block.name === 'trapped_chest',
      maxDistance: 6
    });
    
    if (!cofreBlock) return;
    
    try {
      const contenedor = await bot.openContainer(cofreBlock);
      const items = contenedor.containerItems();
      for (const item of items) {
        await contenedor.withdraw(item.type, null, item.count).catch(() => {});
      }
      contenedor.close();
      console.log('[bestia.js] Cofre saqueado con éxito.');
    } catch (e) {
      // Cofre ocupado o fuera de alcance, ignoramos en silencio
    }
  }
  crearBucle(saquearCofreCercano, 15000);

  // ---- 6. Recoger drops de mobs (items en el suelo) cerca ----
  function recogerDropsCercanos() {
    if (!bot || !bot.entity || !bot.collectBlock) return;
    const drop = bot.nearestEntity(e => e.name === 'item');
    
    if (drop && bot.entity.position.distanceTo(drop.position) < 10) {
      bot.collectBlock.collect(drop, err => {
        if (err && err.message !== 'No target block or entity') {
           // Ignoramos errores menores de pathfinding
        }
      });
    }
  }
  crearBucle(recogerDropsCercanos, 3000);

  console.log('[bestia.js] Modo bestia salvaje activado: ataca, se equipa, saquea y no muere.');
}

module.exports = bestia;