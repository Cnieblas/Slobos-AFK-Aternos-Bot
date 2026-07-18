function randomMs(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function setupLeaveRejoin(bot, createBot) {
  // Timers
  let leaveTimer = null;
  let jumpTimer = null;
  let jumpOffTimer = null;
  let reconnectTimer = null;

  // State
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
    if (leaveTimer) clearTimeout(leaveTimer);
    if (jumpTimer) clearTimeout(jumpTimer);
    if (jumpOffTimer) clearTimeout(jumpOffTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    leaveTimer = jumpTimer = jumpOffTimer = reconnectTimer = null;
  }

  function scheduleNextJump() {
    // Verificación de seguridad para evitar crasheos si el bot fue destruido
    if (stopped || !bot || !bot.entity || typeof bot.setControlState !== 'function') return;

    try {
      bot.setControlState('jump', true);
      jumpOffTimer = setTimeout(() => {
        if (!stopped && bot && typeof bot.setControlState === 'function') {
          bot.setControlState('jump', false);
        }
      }, 300);
    } catch (e) {
      // Ignorar errores menores de movimiento
    }

    // Salto aleatorio entre 20s y 5m
    const nextJump = randomMs(20000, 5 * 60 * 1000);
    jumpTimer = setTimeout(scheduleNextJump, nextJump);
  }

  function scheduleReconnect(reason = 'end') {
    if (stopped) return;

    // Reconexión rápida: 2s -> 10s
    let delay = randomMs(2000, 10000);

    // Aumentar el tiempo si está fallando mucho
    reconnectAttempts++;
    if (reconnectAttempts > 3) {
      delay += 5000;
    }

    // Límite máximo de 15 segundos
    delay = Math.min(delay, 15000);

    logThrottled(`[AFK] Rejoin scheduled in ${Math.round(delay / 1000)}s (reason: ${reason}, attempt: ${reconnectAttempts})`);

    reconnectTimer = setTimeout(() => {
      if (stopped) return;
      try {
        if (typeof createBot === 'function') createBot();
      } catch (e) {
        console.log('[AFK] createBot error:', e?.message || e);
        scheduleReconnect('createBot-error');
      }
    }, delay);
  }

  bot.once('spawn', () => {
    // Resetear contador de intentos al conectar exitosamente
    reconnectAttempts = 0;

    // Limpiar temporizadores viejos
    cleanup();
    stopped = false;

    // Mantenerse conectado entre 1 y 5 minutos antes de desconectarse
    const stayTime = randomMs(60000, 300000);

    logThrottled(`[AFK] Will leave in ${Math.round(stayTime / 1000)} seconds`);

    scheduleNextJump();

    leaveTimer = setTimeout(() => {
      if (stopped) return;
      logThrottled('[AFK] Leaving server (timer)');
      cleanup();
      try {
        if (bot) bot.quit();
      } catch (e) {
        // Ignorar si el bot ya estaba cerrado
      }
    }, stayTime);
  });

  // Limpiar temporizadores si la conexión termina por cualquier otra razón
  bot.on('end', cleanup);
  bot.on('kicked', cleanup);
  bot.on('error', cleanup);
}

module.exports = setupLeaveRejoin;