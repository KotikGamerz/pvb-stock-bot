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
    // Гир (6 штук)
    'Water Bucket': '💧',
    'Frost Grenade': '❄️',
    'Banana Gun': '🍌',
    'Frost Blower': '🌬️',
    'Carrot Launcher': '🥕',
    'Battery Pack': '🔋'
};

// ----- ИЗБРАННЫЕ ДЛЯ ПИНГА (ТВОИ) -----
const PREFERRED_SEEDS = [
    'King Limone',
    'Starfruit',
    'Brussel Sprouts',
    'Kiwi Cannoneer',
    'Kelp Katapulter'
];

const PREFERRED_GEAR = [
    'Carrot Launcher',
    'Battery Pack'
];

// ----- ХРАНИЛИЩЕ ДАННЫХ -----
let stockData = {
    seeds: [],
    gear: [],
    messageId: null
};

// ===== ЗАГРУЗКА/СОХРАНЕНИЕ СОСТОЯНИЯ =====
async function loadState() {
    try {
        const data = await fs.readFile('state.json', 'utf8');
        const saved = JSON.parse(data);
        stockData.seeds = saved.seeds || [];
        stockData.gear = saved.gear || [];
        stockData.messageId = saved.messageId || null;
        console.log('📂 Загружено состояние');
    } catch (error) {
        console.log('🆕 Новое состояние');
    }
}

async function saveState() {
    await fs.writeFile('state.json', JSON.stringify(stockData, null, 2));
}

// ===== ПАРСИНГ КАНАЛА =====
async function parseChannel(channelId, type) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            console.log(`❌ Канал ${type} не найден`);
            return null;
        }
        
        const messages = await channel.messages.fetch({ limit: 5 });
        
        for (const msg of messages.values()) {
            // Ищем сообщения от PVB Stocks
            if (msg.author.username.includes('PVB Stocks') && msg.embeds && msg.embeds.length > 0) {
                const embed = msg.embeds[0];
                
                if (embed.description) {
                    const items = [];
                    const lines = embed.description.split('\n');
                    
                    for (const line of lines) {
                        // Парсим "- Cactus x4" или "Cactus x4"
                        const match = line.match(/-?\s*([\w\s]+?)\s*x(\d+)/i);
                        if (match) {
                            items.push({
                                name: match[1].trim(),
                                count: parseInt(match[2])
                            });
                        }
                    }
                    
                    if (items.length > 0) {
                        console.log(`✅ Найдено ${type}: ${items.length} предметов`);
                        return items;
                    }
                }
            }
        }
        
        console.log(`❌ Нет свежих данных в ${type}`);
        return null;
    } catch (error) {
        console.error(`Ошибка парсинга ${type}:`, error.message);
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
    
    const message = {
        content: pingText.trim() || undefined,
        embeds: [{
            title: '🌱 PLANTS VS BRAINROTS | STOCK',
            color: 0x00FF00,
            fields: fields,
            footer: {
                text: `Last update: ${new Date().toLocaleTimeString()} UTC`
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        if (stockData.messageId) {
            await axios.patch(
                `${process.env.TARGET_WEBHOOK_URL}/messages/${stockData.messageId}`,
                message
            );
            console.log('✏️ Сообщение обновлено');
        } else {
            const response = await axios.post(process.env.TARGET_WEBHOOK_URL, message);
            stockData.messageId = response.data.id;
            await saveState();
            console.log('📨 Новое сообщение создано');
        }
    } catch (error) {
        console.error('❌ Ошибка отправки:', error.message);
        if (error.response?.status === 404) {
            stockData.messageId = null;
            await saveState();
        }
    }
}

// ===== ОСНОВНАЯ ПРОВЕРКА =====
async function checkAll() {
    console.log(`\n🕒 ${new Date().toLocaleTimeString()} - Проверка...`);
    
    const newSeeds = await parseChannel(process.env.SEED_CHANNEL_ID, 'seeds');
    const newGear = await parseChannel(process.env.GEAR_CHANNEL_ID, 'gear');
    
    let changed = false;
    
    // Сравниваем семена
    if (newSeeds) {
        // Проверяем, отличаются ли от того что уже есть
        if (!stockData.seeds.length || JSON.stringify(newSeeds) !== JSON.stringify(stockData.seeds)) {
            console.log('🔄 Семена изменились или появились впервые');
            stockData.seeds = newSeeds;
            changed = true;
        } else {
            console.log('⏺️ Семена те же');
        }
    } else {
        if (stockData.seeds.length > 0) {
            console.log('🔄 Семена пропали');
            stockData.seeds = [];
            changed = true;
        }
    }
    
    // Сравниваем гир
    if (newGear) {
        if (!stockData.gear.length || JSON.stringify(newGear) !== JSON.stringify(stockData.gear)) {
            console.log('🔄 Гир изменился или появился впервые');
            stockData.gear = newGear;
            changed = true;
        } else {
            console.log('⏺️ Гир тот же');
        }
    } else {
        if (stockData.gear.length > 0) {
            console.log('🔄 Гир пропал');
            stockData.gear = [];
            changed = true;
        }
    }
    
    if (changed) {
        console.log('📤 Отправляем обновление...');
        await saveState();
        await sendToDiscord();
    } else {
        console.log('⏺️ Без изменений');
    }
}

// ===== ЗАПУСК =====
client.on('ready', async () => {
    console.log(`✅ Залогинен как ${client.user.tag}`);
    
    console.log('\n📋 Доступные сервера:');
    client.guilds.cache.forEach(guild => {
        console.log(`🔹 ${guild.name} (${guild.id})`);
    });
    
    await loadState();
    await checkAll();
    
    // Проверка каждые 30 секунд
    setInterval(checkAll, 30 * 1000);
    
    console.log('👀 Бот запущен и следит за каналами');
});

client.login(process.env.USER_TOKEN);
