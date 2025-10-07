const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const config = require('./settings.json');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('Server started'));

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  let pendingPromise = Promise.resolve();

  // --- AUTH FUNCTIONS ---
  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log('[Auth] Sent /register command.');
      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully registered')) resolve();
        else if (message.includes('already registered')) resolve();
        else reject(`Registration failed: "${message}"`);
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log('[Auth] Sent /login command.');
      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully logged in')) resolve();
        else reject(`Login failed: "${message}"`);
      });
    });
  }

  // --- MAIN LOGIC ---
  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m');

    // Auto-auth
    if (config.utils['auto-auth'].enabled) {
      console.log('[INFO] Started auto-auth module');
      const password = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error('[ERROR]', error));
    }

    // Chat messages
    if (config.utils['chat-messages'].enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    // Move to target position
    const pos = config.position;
    if (config.position.enabled) {
      console.log(`\x1b[32m[Afk Bot] Moving to (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    // --- ADVANCED ANTI-AFK ---
    if (config.utils['anti-afk'].enabled) {
      console.log('[INFO] Advanced anti-AFK started.');

      const controls = ['forward', 'back', 'left', 'right'];

      function randomMove() {
        if (!bot.entity || !bot.entity.position) return;

        const move = controls[Math.floor(Math.random() * controls.length)];
        const duration = Math.floor(Math.random() * 2500) + 800; // 0.8s–3.3s
        const shouldJump = Math.random() < 0.3;
        const shouldTurn = Math.random() < 0.4;
        const shouldSneak = config.utils['anti-afk'].sneak && Math.random() < 0.2;

        bot.setControlState(move, true);
        if (shouldJump) bot.setControlState('jump', true);
        if (shouldSneak) bot.setControlState('sneak', true);

        if (shouldTurn) {
          const yaw = bot.entity.yaw + (Math.random() - 0.5) * Math.PI / 2;
          const pitch = (Math.random() - 0.5) * 0.3;
          bot.look(yaw, pitch, false);
        }

        setTimeout(() => {
          bot.setControlState(move, false);
          bot.setControlState('jump', false);
          bot.setControlState('sneak', false);
        }, duration);

        // Idle delay (simulate human-like pauses)
        const nextMoveDelay = Math.floor(Math.random() * 4000) + 2000;
        setTimeout(randomMove, nextMoveDelay);
      }

      setTimeout(randomMove, 3000);
    }
  });

  // --- EVENTS ---
  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[AfkBot] Reached target: ${bot.entity.position}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[AfkBot] Bot died, respawned at ${bot.entity.position}\x1b[0m`);
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      console.log('[INFO] Disconnected, attempting to reconnect...');
      setTimeout(createBot, config.utils['auto-recconect-delay']);
    });
  }

  bot.on('kicked', reason =>
    console.log('\x1b[33m', `[AfkBot] Kicked: ${reason}`, '\x1b[0m')
  );

  bot.on('error', err =>
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`)
  );
}

createBot();
