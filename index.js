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
    'Explosive Cannon': '💥'
};

// ----- ИЗБРАННЫЕ ДЛЯ ПИНГА (ТВОИ) -----
const PREFERRED_SEEDS = [
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
    'Explosive Cannon'
];

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
    
    // Ищем свой сервер по ID
    const myGuild = client.guilds.cache.get(process.env.GUILD_ID);
    
    let pingText = '';
    
    // Формируем пинги ТОЛЬКО для избранных (если есть роли)
    if (myGuild) {
        // Семена
        for (const item of stockData.seeds) {
            if (PREFERRED_SEEDS.includes(item.name)) {
                const role = myGuild.roles.cache.find(r => r.name === item.name);
                if (role) pingText += `<@&${role.id}> `;
            }
        }
        
        // Гир
        for (const item of stockData.gear) {
            if (PREFERRED_GEAR.includes(item.name)) {
                const role = myGuild.roles.cache.find(r => r.name === item.name);
                if (role) pingText += `<@&${role.id}> `;
            }
        }
    }
    
    const fields = [];
    
    // Семена
    if (stockData.seeds.length) {
        const seedText = stockData.seeds
            .map(item => `• ${item.name} ${EMOJIS[item.name] || ''} — ${item.count}`)
            .join('\n');
        
        fields.push({
            name: '🌾 SEEDS',
            value: seedText,
            inline: false
        });
    }
    
    // Гир
    if (stockData.gear.length) {
        const gearText = stockData.gear
            .map(item => `• ${item.name} ${EMOJIS[item.name] || ''} — ${item.count}`)
            .join('\n');
        
        fields.push({
            name: '⚙️ GEAR',
            value: gearText,
            inline: false
        });
    }
    
    const embeds = [];

// ===== EMBED 1 (обычный сток)
embeds.push({
    title: '🌱 PLANTS VS BRAINROTS | STOCK',
    color: 0x00FF00,
    fields: [
        {
            name: '🌾 SEEDS',
            value: stockData.seeds.length
                ? stockData.seeds.map(i => `• ${i.name} ${EMOJIS[i.name] || ''} — ${i.count}`).join('\n')
                : '⚠️ No Data'
        },
        {
            name: '⚙️ GEAR',
            value: stockData.gear.length
                ? stockData.gear.map(i => `• ${i.name} ${EMOJIS[i.name] || ''} — ${i.count}`).join('\n')
                : '⚠️ No Data'
        }
    ],
    footer: {
        text: `Last update: ${new Date().toLocaleTimeString()} UTC`
    },
    timestamp: new Date().toISOString()
});

// ===== EMBED 2 (admin)
if (stockData.adminSeeds?.length) {
    const adminHash = JSON.stringify(stockData.adminSeeds);

    if (adminHash !== stockData.lastAdminHash) {
        stockData.lastAdminHash = adminHash;

        embeds.push({
            title: 'Admin Machine Stock',
            color: 0xFFAA00,
            description: stockData.adminSeeds
                .map(i => `- ${i.name} — ${i.count}`)
                .join('\n'),
            footer: {
                text: `Last update: ${new Date().toLocaleTimeString()} UTC`
            },
            timestamp: new Date().toISOString()
        });

        console.log('🛠 Новый ADMIN сток добавлен');
    } else {
        console.log('⏸️ Admin уже был — пропускаем');
    }
}
    await axios.post(process.env.TARGET_WEBHOOK_URL, {
    content: pingText.trim() || undefined,
    embeds
});

console.log('📨 Отправлено!');
}
    
// ===== ОСНОВНАЯ ПРОВЕРКА =====
async function checkAll() {
    console.log(`\n🕒 ${new Date().toLocaleTimeString()} - Проверка...`);
    
    const seedData = await parseSeedsChannel(process.env.SEED_CHANNEL_ID);
    const gearData = await parseChannel(process.env.GEAR_CHANNEL_ID, 'gear');

    const normalSeeds = seedData.normal;
    const adminSeeds = seedData.admin;
    const adminMsgId = seedData.adminMessageId;

    const seedMsgId = seedData.normalMessageId;
    const gearMsgId = gearData?.messageId;

    const newGear = gearData?.items;

    // 🚫 проверка: новый ли это сток
    if (
        seedMsgId === stockData.lastSeedMessageId &&
        gearMsgId === stockData.lastGearMessageId
    ) {
        console.log('⏸️ Тот же самый сток — пропускаем');
        return;
    }

    // 💾 сохраняем новые ID
    stockData.lastSeedMessageId = seedMsgId;
    stockData.lastGearMessageId = gearMsgId;

    // обновляем данные
    stockData.seeds = normalSeeds || [];
    stockData.gear = newGear || [];
    stockData.adminSeeds = adminSeeds || [];

    // 👇 ВСТАВЛЯЕМ СРАЗУ ПОСЛЕ
    if (adminMsgId) {
        stockData.lastAdminMessageId = adminMsgId;
    }

    console.log('🚀 Новый сток (по messageId)');

    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    // 🧠 проверка: начало часа?
    const isTopOfHour = minutes === 0;

    // 🧠 есть ли уже админ?
    const hasNewAdmin = adminMsgId && adminMsgId !== stockData.lastAdminMessageId;

    // 🧠 УМНАЯ ЗАДЕРЖКА
    if (isTopOfHour && !hasNewAdmin && seconds < 20)
        console.log('⏳ Начало часа и админ ещё не пришёл — ждём...');

        await new Promise(r => setTimeout(r, 6000)); // 6 сек

        // 🔄 повторный парсинг
        const retrySeedData = await parseSeedsChannel(process.env.SEED_CHANNEL_ID);

        if (retrySeedData.admin && retrySeedData.admin.length > 0) {
            stockData.adminSeeds = retrySeedData.admin;
            stockData.lastAdminMessageId = retrySeedData.adminMessageId;
            console.log('✅ Админ сток появился после ожидания');
        } else {
           console.log('⚠️ Админ всё ещё не появился');
        }
    } else {
        if (!isTopOfHour) {
            console.log('⚡ Не начало часа — без задержки');
        } else if (hasAdmin) {
            console.log('⚡ Админ уже есть — без задержки');
        }
    }

    await saveState();
    await sendToDiscord();
}

// ===== ЗАПУСК =====
client.on('ready', async () => {
    console.log(`✅ Залогинен как ${client.user.tag}`);
    
    console.log('\n📋 Доступные сервера:');
    client.guilds.cache.forEach(guild => {
        console.log(`🔹 ${guild.name} (${guild.id})`);
    });

    await loadState();

    console.log('👀 Бот запущен и следит за каналами');

    while (true) {
        const start = Date.now();

        try {
            await checkAll();
        } catch (err) {
            console.error('❌ Ошибка в цикле:', err.message);
        }

        const elapsed = Date.now() - start;
        const delay = Math.max(0, 30000 - elapsed);

        await new Promise(r => setTimeout(r, delay));
        }
});

client.login(process.env.USER_TOKEN);
