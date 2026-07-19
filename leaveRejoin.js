function randomMs(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// Distribución gaussiana aproximada (Box-Muller) - los humanos no reaccionan
// en tiempos perfectamente uniformes, tienden a agruparse cerca de un promedio.
function randomGaussianMs(meanMs, stdDevMs, minMs, maxMs) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const value = meanMs + gaussian * stdDevMs;
  return Math.max(minMs, Math.min(maxMs, Math.floor(value)));
}

function setupLeaveRejoin(bot, createBot) {
  let leaveTimer = null;
  let jumpTimer = null;
  let jumpOffTimer = null;
  let reconnectTimer = null;
  let microActionTimer = null;

  let stopped = false;
  let reconnectAttempts = 0;
  let lastLogAt = 0;

  function logThrottled(msg, minGapMs = 2000) {
    const now = Date.now();
    if (now - lastLogAt >= minGapMs) {
      lastLogAt = now;
      console.log(msg);
    }
  }

  function cleanup() {
    stopped = true;
    [leaveTimer, jumpTimer, jumpOffTimer, reconnectTimer, microActionTimer].forEach(
      (t) => t && clearTimeout(t),
    );
    leaveTimer = jumpTimer = jumpOffTimer = reconnectTimer = microActionTimer = null;
  }

  // FIX: salto con timing no uniforme (gaussiano) en vez de uniforme puro
  function scheduleNextJump() {
    if (stopped || !bot || !bot.entity || typeof bot.setControlState !== "function")
      return;

    try {
      bot.setControlState("jump", true);
      // FIX: duración de salto variable, no siempre 300ms exactos
      const holdMs = randomMs(180, 420);
      jumpOffTimer = setTimeout(() => {
        if (!stopped && bot && typeof bot.setControlState === "function") {
          bot.setControlState("jump", false);
        }
      }, holdMs);
    } catch (e) {}

    // FIX: tiempos agrupados alrededor de un promedio en vez de uniforme plano
    const nextJump = randomGaussianMs(90000, 45000, 20000, 300000);
    jumpTimer = setTimeout(scheduleNextJump, nextJump);
  }

  // FIX: micro-acciones aleatorias entre saltos (mirar, agacharse un instante,
  // rotar la cámara) - un jugador real casi nunca esta perfectamente quieto
  // ni hace solo la misma acción repetida.
  function scheduleMicroAction() {
    if (stopped || !bot || !bot.entity) return;

    try {
      const accion = Math.floor(Math.random() * 4);
      switch (accion) {
        case 0:
          // Mirar a una dirección aleatoria
          bot.look(
            Math.random() * Math.PI * 2 - Math.PI,
            (Math.random() * Math.PI) / 3 - Math.PI / 6,
            true,
          );
          break;
        case 1:
          // Agacharse brevemente
          if (typeof bot.setControlState === "function") {
            bot.setControlState("sneak", true);
            setTimeout(() => {
              if (bot && typeof bot.setControlState === "function")
                bot.setControlState("sneak", false);
            }, randomMs(200, 600));
          }
          break;
        case 2:
          // Swing de brazo (como si estuviera revisando el inventario o clickeando)
          if (typeof bot.swingArm === "function") bot.swingArm();
          break;
        case 3:
          // Cambiar slot del hotbar
          if (typeof bot.setQuickBarSlot === "function") {
            bot.setQuickBarSlot(Math.floor(Math.random() * 9));
          }
          break;
      }
    } catch (e) {}

    const nextAction = randomGaussianMs(15000, 8000, 4000, 40000);
    microActionTimer = setTimeout(scheduleMicroAction, nextAction);
  }

  function scheduleReconnect(reason = "end") {
    if (stopped) return;

    // FIX: reconexión con timing gaussiano en vez de rango plano - menos
    // "perfecto" y mecánico que un delay uniforme
    let delay = randomGaussianMs(6000, 3000, 2000, 15000);

    reconnectAttempts++;
    if (reconnectAttempts > 3) {
      delay += 5000;
    }
    delay = Math.min(delay, 20000);

    logThrottled(
      `[AFK] Rejoin scheduled in ${Math.round(delay / 1000)}s (reason: ${reason}, attempt: ${reconnectAttempts})`,
    );

    reconnectTimer = setTimeout(() => {
      if (stopped) return;
      try {
        if (typeof createBot === "function") createBot();
      } catch (e) {
        console.log("[AFK] createBot error:", e?.message || e);
        scheduleReconnect("createBot-error");
      }
    }, delay);
  }

  bot.once("spawn", () => {
    reconnectAttempts = 0;
    cleanup();
    stopped = false;

    // FIX: tiempo de estadía con distribución gaussiana - un jugador real
    // no se desconecta en intervalos perfectamente aleatorios uniformes,
    // tiende a sesiones que rondan un promedio (aca ~2.5 min) con variación.
    const stayTime = randomGaussianMs(150000, 70000, 45000, 300000);

    logThrottled(`[AFK] Will leave in ${Math.round(stayTime / 1000)} seconds`);

    scheduleNextJump();
    scheduleMicroAction();

    leaveTimer = setTimeout(() => {
      if (stopped) return;
      logThrottled("[AFK] Leaving server (timer)");
      cleanup();
      try {
        if (bot) bot.quit();
      } catch (e) {}
    }, stayTime);
  });

  bot.on("end", cleanup);
  bot.on("kicked", cleanup);
  bot.on("error", cleanup);
}

module.exports = setupLeaveRejoin;
