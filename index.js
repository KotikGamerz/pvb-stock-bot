require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');
const fs = require('fs').promises;
const express = require('express');

// ===== Express сервер для Render =====
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🌱 PVB Bot is running!');
});

app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});
// ======================================

const client = new Client();

// ----- ЭМОДЗИ ДЛЯ ВСЕХ ПРЕДМЕТОВ -----
const EMOJIS = {
    // Семена (19 штук)
    'Cactus': '🌵',
    'Strawberry': '🍓',
    'Pumpkin': '🎃',
    'Sunflower': '🌻',
    'Dragon Fruit': '🐉',
    'Eggplant': '🍆',
    'Watermelon': '🍉',
    'Grape': '🍇',
    'Cocotank': '🥥',
    'Carnivorous Plant': '🪴',
    'Mr Carrot': '🥕',
    'Tomatrio': '🍅',
    'Shroombino': '🍄',
    'Mango': '🥭',
    'King Limone': '🍋',
    'Starfruit': '⭐',
    'Brussel Sprouts': '🥬',
    'Kiwi Cannoneer': '🥝',
    'Kelp Katapulter': '🌿',
    'Corn Cobblazzio': '🌽',
    // Гир (6 штук)
    'Water Bucket': '💧',
    'Frost Grenade': '❄️',
    'Banana Gun': '🍌',
    'Frost Blower': '🌬️',
    'Carrot Launcher': '🥕',
    'Battery Pack': '🔋',
    'ExplosiveCannon': '💥'
};

// ----- ИЗБРАННЫЕ ДЛЯ ПИНГА -----
const PREFERRED_SEEDS = [
    'Mr Carrot',
    'Tomatrio',
    'Shroombino',
    'King Limone',
    'Starfruit',
    'Brussel Sprouts',
    'Kiwi Cannoneer',
    'Kelp Katapulter',
    'Corn Cobblazzio'
];

const PREFERRED_GEAR = [
    'Carrot Launcher',
    'Battery Pack',
    'ExplosiveCannon'
];

const ROLE_IDS = {
    "Mr Carrot": "1479770964827967508",
    "Tomatrio": "1479770968086937790",
    "Shroombino": "1479770977608138803",
    "King Limone": "1479603135281627329",
    "Starfruit": "1479603138813235220",
    "Brussel Sprouts": "1479603143284363383",
    "Kiwi Cannoneer": "1479603147017031713",
    "Kelp Katapulter": "1479603149928136936",
    "Corn Cobblazzio": "1498271683294003320",
    "Carrot Launcher": "1498274230050226277",
    "Battery Pack": "1498275323169603697",
    "ExplosiveCannon": "1498275448776560690"
};
 

// ----- ХРАНИЛИЩЕ ДАННЫХ -----
let stockData = {
    seeds: [],
    gear: [],
    adminSeeds: [],
    lastAdminHash: null,

    lastSeedMessageId: null,
    lastGearMessageId: null,
    lastAdminMessageId: null
};
let shouldIncludeAdmin = false;
let isChecking = false;
let lastAdminSentHour = null;

// ===== ЗАГРУЗКА/СОХРАНЕНИЕ СОСТОЯНИЯ =====
async function loadState() {
    try {
        const data = await fs.readFile('state.json', 'utf8');
        const saved = JSON.parse(data);

        stockData.seeds = saved.seeds || [];
        stockData.gear = saved.gear || [];
        stockData.messageId = saved.messageId || null;
        stockData.lastAdminHash = saved.lastAdminHash || null;
        stockData.lastSeedMessageId = saved.lastSeedMessageId || null;
        stockData.lastGearMessageId = saved.lastGearMessageId || null;
        stockData.lastAdminMessageId = saved.lastAdminMessageId || null;

        console.log('📂 Загружено состояние');
    } catch (error) {
        console.log('🆕 Новое состояние');
    }
}

async function saveState() {
    await fs.writeFile('state.json', JSON.stringify(stockData, null, 2));
}

// ===== ПАРСИНГ КАНАЛА SEED =====
async function parseSeedsChannel(channelId) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            return { normal: null, admin: null, normalMessageId: null, adminMessageId: null };
        }

        const messages = await channel.messages.fetch({ limit: 5 });

        // 🔥 сортируем от нового к старому
        const sorted = Array.from(messages.values())
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        let normal = null;
        let admin = null;

        let normalMessageId = null;
        let adminMessageId = null;

        for (const msg of sorted) {
            if (!msg.author.username.includes('PVB Stocks')) continue;
            if (!msg.embeds?.length) continue;

            const embed = msg.embeds[0];
            const title = embed.title?.toLowerCase() || '';
            const description = embed.description;

            if (!description) continue;

            const items = [];

            for (const line of description.split('\n')) {
                const match = line.match(/-?\s*([\w\s]+?)\s*x(\d+)/i);
                if (match) {
                    items.push({
                        name: match[1].trim(),
                        count: parseInt(match[2])
                    });
                }
            }

            if (!items.length) continue;

            // 🟢 обычный сток
            if (!title.includes('admin') && !normal) {
                normal = items;
                normalMessageId = msg.id;
            }

            // 🟠 админ сток
            if (title.includes('admin') && !admin) {
                admin = items;
                adminMessageId = msg.id;
            }

            // 🚀 нашли оба — выходим сразу
            if (normal && admin) break;
        }

        return { normal, admin, normalMessageId, adminMessageId };

    } catch (err) {
        console.error('Ошибка seeds:', err.message);
        return { normal: null, admin: null, normalMessageId: null, adminMessageId: null };
    }
}

// ===== ПАРСИНГ КАНАЛА GEAR =====
async function parseChannel(channelId, type) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return null;

        const messages = await channel.messages.fetch({ limit: 5 });

        // 🔥 сортируем от нового к старому
        const sorted = Array.from(messages.values())
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        for (const msg of sorted) {
            if (!msg.author.username.includes('PVB Stocks')) continue;
            if (!msg.embeds?.length) continue;

            const embed = msg.embeds[0];
            const description = embed.description;

            if (!description) continue;

            const items = [];

            for (const line of description.split('\n')) {
                const match = line.match(/-?\s*([\w\s]+?)\s*x(\d+)/i);
                if (match) {
                    items.push({
                        name: match[1].trim(),
                        count: parseInt(match[2])
                    });
                }
            }

            if (items.length > 0) {
                // 🟢 сразу берём САМЫЙ СВЕЖИЙ и выходим
                return {
                    items,
                    messageId: msg.id
                };
            }
        }

        return null;

    } catch (err) {
        console.error(`Ошибка ${type}:`, err.message);
        return null;
    }
}

// ===== ОТПРАВКА В DISCORD =====
async function sendToDiscord() {
    if (!stockData.seeds.length && !stockData.gear.length) {
        console.log('⏳ Нет данных для отправки');
        return;
    }

    // =========================
    // 🔔 ПИНГИ (без myGuild)
    // =========================
    let pingSet = new Set();

    // 🌾 SEEDS
    for (const item of stockData.seeds) {
        if (PREFERRED_SEEDS.includes(item.name)) {
            if (ROLE_IDS[item.name]) {
                pingSet.add(`<@&${ROLE_IDS[item.name]}>`);
            } else {
                console.log("❌ Нет ROLE_ID для:", item.name);
            }
        }
    }

    // ⚙️ GEAR
    for (const item of stockData.gear) {
        if (PREFERRED_GEAR.includes(item.name)) {
            if (ROLE_IDS[item.name]) {
                pingSet.add(`<@&${ROLE_IDS[item.name]}>`);
            } else {
                console.log("❌ Нет ROLE_ID для:", item.name);
            }
        }
    }

    // 🛠 ADMIN 
    if (shouldIncludeAdmin) {
        for (const item of stockData.adminSeeds || []) {

            if (
                PREFERRED_SEEDS.includes(item.name) ||
                PREFERRED_GEAR.includes(item.name)
            ) {

                if (ROLE_IDS[item.name]) {
                    pingSet.add(`<@&${ROLE_IDS[item.name]}>`);
                }
            }
        }
    }

    const pingText = [...pingSet].join(' ');

    // =========================
    // 📦 ОСНОВНОЙ EMBED
    // =========================
    const now = new Date();

    const embed = {
        title: "🌱 PLANTS VS BRAINROTS | STOCK",
        color: 0x3498db,
        fields: [],
        footer: {
            text: `Last update: ${now.toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: now.toISOString()
    };

    // 🌾 SEEDS
    if (stockData.seeds.length > 0) {
        embed.fields.push({
            name: "🌾 SEEDS",
            value: stockData.seeds
                .map(i => `- ${EMOJIS[i.name] || ""} ${i.name} — ${i.count}`)
                .join('\n'),
            inline: false
        });
    }

    // ⚙️ GEAR
    if (stockData.gear.length > 0) {
        embed.fields.push({
            name: "⚙️ GEAR",
            value: stockData.gear
                .map(i => `- ${EMOJIS[i.name] || ""} ${i.name} — ${i.count}`)
                .join('\n'),
            inline: false
        });
    }

    const embeds = [embed];

    // =========================
    // 🛠 ADMIN EMBED (финал)
    // =========================
    if (shouldIncludeAdmin && stockData.adminSeeds?.length) {
        embeds.push({
            title: '🛠 ADMIN STOCK',
            color: 0xff3b3b,
            description: stockData.adminSeeds
                .map(i => `- ${EMOJIS[i.name] || ""} ${i.name} — ${i.count}`)
                .join('\n'),
            footer: {
                text: `Last update: ${now.toLocaleTimeString('en-GB')} UTC`
            },
            timestamp: now.toISOString()
        });

        console.log('🛠 ADMIN добавлен');
    }

    // =========================
    // 📤 ОТПРАВКА
    // =========================
    const payload = {
        content: pingText || undefined,
        embeds
    };

    const webhookUrls = [
        process.env.TARGET_WEBHOOK_URL,
        process.env.KIRO_WEBHOOK_URL
    ].filter(Boolean);

    const results = await Promise.allSettled(
        webhookUrls.map(url =>
            axios.post(url, payload)
        )
    );

    results.forEach((result, index) => {

        if (result.status === 'fulfilled') {
            console.log(`✅ Webhook #${index + 1} отправлен`);
        } else {
            console.error(
                `❌ Webhook #${index + 1} ошибка:`,
                result.reason?.message
            );
        }

    });

    console.log('📨 Отправка завершена');

}
    
// ===== ОСНОВНАЯ ПРОВЕРКА =====
async function checkAll() {
    console.log(`\n🕒 ${new Date().toLocaleTimeString()} - Проверка...`);

    if (isChecking) return;
    isChecking = true;

    try {
        const seedData = await parseSeedsChannel(process.env.SEED_CHANNEL_ID);
        const gearData = await parseChannel(process.env.GEAR_CHANNEL_ID, 'gear');

        const normalSeeds = seedData.normal;
        const adminSeeds = seedData.admin;
        const adminMsgId = seedData.adminMessageId;

        const seedMsgId = seedData.normalMessageId;
        const gearMsgId = gearData?.messageId;

        const newGear = gearData?.items;

        // 🧠 ВРЕМЯ
        const now = new Date();
        const currentHour = now.getUTCHours();
        const isTopOfHour = now.getMinutes() === 0;

        // 🧠 Admin отправляем каждый час
        shouldIncludeAdmin = isTopOfHour && lastAdminSentHour !== currentHour;

        if (shouldIncludeAdmin) {
            console.log('🛠 ADMIN будет добавлен');
            lastAdminSentHour = currentHour;
        }

        // 🚫 ПРОВЕРКА СТОКА
        const isSameStock =
            seedMsgId === stockData.lastSeedMessageId &&
            gearMsgId === stockData.lastGearMessageId;

        if (isSameStock && !shouldIncludeAdmin) {
            console.log('⏸️ Тот же сток — пропускаем');
            return;
        }

        // 💾 ID
        stockData.lastSeedMessageId = seedMsgId;
        stockData.lastGearMessageId = gearMsgId;

        if (adminMsgId) {
            stockData.lastAdminMessageId = adminMsgId;
        }

        // 💾 ДАННЫЕ
        stockData.seeds = normalSeeds || [];
        stockData.gear = newGear || [];
        stockData.adminSeeds = adminSeeds || [];

        console.log('🚀 Отправляем сток');

        await saveState();
        await sendToDiscord();

    } catch (err) {
        console.error('❌ Ошибка:', err.message);
    } finally {
        isChecking = false;
    }
}

function startSmartScheduler() {

    const scheduleNext = () => {
        const now = new Date();
        const seconds = now.getSeconds();

        let targetSecond;

        if (seconds < 20) targetSecond = 20;
        else if (seconds < 50) targetSecond = 50;
        else targetSecond = 80; // 60 + 20

        let delay = (targetSecond - seconds) * 1000;

        console.log(`⏱️ Следующая проверка через ${delay / 1000}s`);

        setTimeout(async () => {
            try {
                await checkAll();
            } catch (err) {
                console.error('❌ Ошибка в scheduler:', err.message);
            }

            scheduleNext();
        }, delay);
    };

    scheduleNext();
}

client.on('ready', async () => {
    console.log(`✅ Залогинен как ${client.user.tag}`);

    console.log('\n📋 Доступные сервера:');
    client.guilds.cache.forEach(guild => {
        console.log(`🔹 ${guild.name} (${guild.id})`);
    });

    // загрузка состояния
    await loadState();

    console.log('👀 PvB бот запущен');
    console.log('🧠 Smart scheduler запущен');

    startSmartScheduler();
});

client.on('error', (err) => {
    console.error("❌ CLIENT ERROR:", err);
});

client.on('disconnect', () => {
    console.log("🔌 DISCONNECTED");
});

client.on('rateLimit', (info) => {
    console.log("⏳ RATE LIMIT:", info);
});

console.log("🔑 TOKEN:", process.env.USER_TOKEN ? "есть" : "нет");

client.login(process.env.USER_TOKEN)
    .then(() => console.log("📲 login() вызван успешно"))
    .catch(err => console.error("❌ LOGIN ERROR:", err));
