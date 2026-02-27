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

// ----- ИЗБРАННЫЕ ДЛЯ ПИНГА -----
const PREFERRED_SEEDS = [
    'Dragon Fruit',
    'Strawberry',
    'Cactus',
    'Pumpkin'
];

const PREFERRED_GEAR = [
    'Banana Gun',
    'Frost Grenade',
    'Water Bucket'
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
        stockData = JSON.parse(data);
        console.log('📂 Загружено состояние');
    } catch (error) {
        console.log('🆕 Новое состояние');
    }
}

async function saveState() {
    await fs.writeFile('state.json', JSON.stringify(stockData, null, 2));
}

// ===== ПАРСИНГ КАНАЛА =====
async function parseChannel(channelId, type) { // type = 'seeds' или 'gear'
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.embeds || !msg.embeds.length) return null;
        
        const embed = msg.embeds[0];
        if (!embed.description) return null;
        
        const items = [];
        const lines = embed.description.split('\n');
        
        for (const line of lines) {
            // Парсим строки типа "- Cactus x4" или "- Water Bucket x5"
            const match = line.match(/- ([\w\s]+?) x(\d+)/i);
            if (match) {
                items.push({
                    name: match[1].trim(),
                    count: parseInt(match[2])
                });
            }
        }
        
        return items.length ? items : null;
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
    
    // Ищем свой сервер по ID из .env
    const myGuild = client.guilds.cache.get(process.env.GUILD_ID);
    
    let pingText = '';
    
    // Формируем пинги (только для избранных)
    if (myGuild) {
        // Сначала проверяем избранные семена
        for (const item of stockData.seeds) {
            if (PREFERRED_SEEDS.includes(item.name)) {
                const myRole = myGuild.roles.cache.find(r => r.name === item.name);
                if (myRole) {
                    pingText += `<@&${myRole.id}> `;
                }
            }
        }
        
        // Потом избранный гир
        for (const item of stockData.gear) {
            if (PREFERRED_GEAR.includes(item.name)) {
                const myRole = myGuild.roles.cache.find(r => r.name === item.name);
                if (myRole) {
                    pingText += `<@&${myRole.id}> `;
                }
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
        content: pingText.trim(),
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
    
    const [newSeeds, newGear] = await Promise.all([
        parseChannel(process.env.SEED_CHANNEL_ID, 'seeds'),
        parseChannel(process.env.GEAR_CHANNEL_ID, 'gear')
    ]);
    
    let changed = false;
    
    if (newSeeds) {
        if (JSON.stringify(newSeeds) !== JSON.stringify(stockData.seeds)) {
            console.log('🔄 Семена изменились');
            stockData.seeds = newSeeds;
            changed = true;
        }
    } else {
        if (stockData.seeds.length > 0) {
            stockData.seeds = [];
            changed = true;
        }
    }
    
    if (newGear) {
        if (JSON.stringify(newGear) !== JSON.stringify(stockData.gear)) {
            console.log('🔄 Гир изменился');
            stockData.gear = newGear;
            changed = true;
        }
    } else {
        if (stockData.gear.length > 0) {
            stockData.gear = [];
            changed = true;
        }
    }
    
    if (changed) {
        await saveState();
        await sendToDiscord();
    } else {
        console.log('⏺️ Без изменений');
    }
}

// ===== ЗАПУСК =====
client.on('ready', async () => {
    console.log(`✅ Залогинен как ${client.user.tag}`);
    
    console.log('\n📋 СПИСОК ТВОИХ СЕРВЕРОВ:');
    client.guilds.cache.forEach(guild => {
        console.log(`🔹 "${guild.name}" (ID: ${guild.id})`);
    });
    
    await loadState();
    await checkAll();
    
    setInterval(checkAll, 30 * 1000);
    
    console.log('👀 Бот запущен и следит за каналами');
});

client.login(process.env.USER_TOKEN);
