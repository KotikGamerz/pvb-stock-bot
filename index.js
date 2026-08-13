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

let lastPriceMessageId = null;
let lastAuctionMessageId = null;

let lastFallPriceMessageId = null;
let lastFallAuctionMessageId = null;

const ENABLE_PVB = process.env.ENABLE_PVB === 'true';
const ENABLE_GAG2_PRICES = process.env.ENABLE_GAG2_PRICES !== 'false';
const ENABLE_GAG2_AUCTIONS = process.env.ENABLE_GAG2_AUCTIONS !== 'false';

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
        lastPriceMessageId = saved.lastPriceMessageId || null;
        lastAuctionMessageId = saved.lastAuctionMessageId || null;
        lastFallPriceMessageId = saved.lastFallPriceMessageId || null;
        lastFallAuctionMessageId = saved.lastFallAuctionMessageId || null;

        console.log('📂 Загружено состояние');
    } catch (error) {
        console.log('🆕 Новое состояние');
    }
}

async function saveState() {
    const dataToSave = {
        ...stockData,
        lastPriceMessageId,
        lastAuctionMessageId,
        lastFallPriceMessageId,
        lastFallAuctionMessageId
    };

    await fs.writeFile(
        'state.json',
        JSON.stringify(dataToSave, null, 2)
    );
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

async function fetchPriceEmbed(channelId) {
    try {
        const channel = client.channels.cache.get(channelId);

        if (!channel) {
            console.log('❌ Price канал не найден');
            return null;
        }

        const messages = await channel.messages.fetch({ limit: 5 });

        const sorted = Array.from(messages.values())
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        const msg = sorted.find(m =>
            m.embeds?.length > 0 &&
            m.embeds[0].title?.includes("Stock Prices")
        );

        if (!msg) {
            console.log('⚠️ Price embed не найден');
            return null;
        }

        return {
            messageId: msg.id,
            embed: msg.embeds[0]
        };

    } catch (err) {
        console.error('❌ Ошибка price:', err.message);
        return null;
    }
}

async function fetchOriginalEmbed(
    channelId,
    requiredTitle,
    label
) {
    try {
        const channel =
            client.channels.cache.get(channelId);

        if (!channel) {
            console.log(`❌ ${label} канал не найден`);
            return null;
        }

        const messages =
            await channel.messages.fetch({
                limit: 5
            });

        const sorted =
            Array.from(messages.values())
                .sort(
                    (a, b) =>
                        b.createdTimestamp -
                        a.createdTimestamp
                );

        const msg = sorted.find(message =>
            message.embeds?.length > 0 &&
            (message.embeds[0].title || '')
                .toLowerCase()
                .includes(
                    requiredTitle.toLowerCase()
                )
        );

        if (!msg) {
            console.log(
                `⚠️ ${label} embed не найден`
            );
            return null;
        }

        return {
            messageId: msg.id,
            embed: msg.embeds[0]
        };

    } catch (err) {
        console.error(
            `❌ Ошибка ${label}:`,
            err.message
        );

        return null;
    }
}

async function fetchAuctionEmbed(channelId) {
    try {
        const channel = client.channels.cache.get(channelId);

        if (!channel) {
            console.log('❌ Auction канал не найден');
            return null;
        }

        const messages = await channel.messages.fetch({ limit: 5 });

        const sorted = Array.from(messages.values())
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        const msg = sorted.find(m =>
            m.embeds?.length > 0 &&
            m.embeds[0].title?.includes("Auctions Stock")
        );

        if (!msg) {
            console.log('⚠️ Auction embed не найден');
            return null;
        }

        return {
            messageId: msg.id,
            embed: msg.embeds[0]
        };

    } catch (err) {
        console.error('❌ Ошибка auction:', err.message);
        return null;
    }
}

function parseAuctionItems(embed) {

    const text = embed.description || '';

    const items = [];

    for (const line of text.split('\n')) {

        const clean = line.trim();

        const match = clean.match(/^•\s*(.+?)\s*x(\d+)$/i);

        if (!match) continue;

        items.push({
            text: `- ${match[1]} — ${match[2]}`
        });
    }

    return items;
}

function parsePriceItems(embed) {

    const text =
        embed.description ||
        embed.fields?.map(f => f.value).join('\n') ||
        '';

    const items = [];

    for (const rawLine of text.split('\n')) {

        const line = rawLine.trim();

        if (!line) continue;

        /*
            Примеры:
            🌘 Eclipse Bloom x1.2
            🫛 Green Bean x1.19
            🌵 Cactus x1.18
            🫐 Blueberry x0.97
        */

        const match = line.match(
            /^(.+?)\s+x(\d+(?:\.\d+)?)$/i
        );

        if (!match) {
            console.log(
                "⚠️ Price строка не распознана:",
                line
            );
            continue;
        }

        items.push({
            raw: match[1].trim(),
            multiplier: match[2]
        });
    }

    return items;
}

function buildPriceFields(items, maxLength = 1000) {
    const fields = [];
    let currentLines = [];

    for (const item of items) {
        const line = `- ${item.raw} — x${item.multiplier}`;

        const currentText = currentLines.join('\n');

        if (
            currentLines.length > 0 &&
            currentText.length + line.length + 1 > maxLength
        ) {
            fields.push({
                name: fields.length === 0 ? "📈 PRICES" : "\u200b",
                value: currentLines.join('\n'),
                inline: false
            });

            currentLines = [];
        }

        currentLines.push(line);
    }

    if (currentLines.length > 0) {
        fields.push({
            name: fields.length === 0 ? "📈 PRICES" : "\u200b",
            value: currentLines.join('\n'),
            inline: false
        });
    }

    return fields;
}

async function sendPriceEmbed(originalEmbed) {

    const items = parsePriceItems(originalEmbed);

    if (!items.length) {
        console.log("❌ Price: предметы не распознаны");
        return;
    }

    const now = new Date();

    const newEmbed = {
        title: "📈 GROW A GARDEN 2 | STOCK PRICES",
        color: 0x5865f2,
        fields: buildPriceFields(items),
        footer: {
            text:
                `Last update: ` +
                `${now.toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: now.toISOString()
    };

    const payload = {
        embeds: [newEmbed]
    };

    const webhookUrls = [
        process.env.PRICE_WEBHOOK_URL,
        process.env.KIRO_PRICE_WEBHOOK_URL
    ].filter(Boolean);

    const results = await Promise.allSettled(
        webhookUrls.map(url =>
            axios.post(url, payload)
        )
    );

    results.forEach((result, index) => {

        if (result.status === 'fulfilled') {

            console.log(
                `✅ Price Webhook #${index + 1} отправлен`
            );

        } else {

            console.error(
                `❌ Price Webhook #${index + 1} ошибка:`,
                result.reason?.response?.data ||
                result.reason?.message
            );
        }
    });

    console.log(
        `📈 GAG2 Stock Prices отправлены: ${items.length} предметов`
    );
}

async function sendOriginalEmbed(
    embed,
    webhookUrls,
    label
) {
    const payload = {
        embeds: [embed]
    };

    const urls =
        webhookUrls.filter(Boolean);

    if (!urls.length) {
        console.log(
            `❌ ${label}: вебхуки не указаны`
        );
        return;
    }

    const results =
        await Promise.allSettled(
            urls.map(url =>
                axios.post(url, payload)
            )
        );

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            console.log(
                `✅ ${label} Webhook #${index + 1} отправлен`
            );
        } else {
            console.error(
                `❌ ${label} Webhook #${index + 1} ошибка:`,
                result.reason?.response?.data ||
                result.reason?.message
            );
        }
    });
}

async function sendAuctionEmbed(embed) {

    const items = parseAuctionItems(embed);

    const now = new Date();

    const newEmbed = {
        title: "🛒 GROW A GARDEN 2 | AUCTIONS STOCK",
        color: 0xffa726,
        fields: [
            {
                name: "🛒 AUCTIONS",
                value: items
                    .map(i => i.text)
                    .join('\n'),
                inline: false
            }
        ],
        footer: {
            text: `Last update: ${now.toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: now.toISOString()
    };

    const payload = {
        embeds: [newEmbed]
    };

    const webhookUrls = [
        process.env.AUCTION_WEBHOOK_URL,
        process.env.KIRO_AUCTION_WEBHOOK_URL
    ].filter(Boolean);

    const results = await Promise.allSettled(
        webhookUrls.map(url =>
            axios.post(url, payload)
        )
    );

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            console.log(`✅ Auction Webhook #${index + 1} отправлен`);
        } else {
            console.error(
                `❌ Auction Webhook #${index + 1} ошибка:`,
                result.reason?.message
            );
        }
    });
}

async function checkPrices() {
    console.log('📈 Проверка GAG2 Stock Prices...');

    const data = await fetchPriceEmbed(
        process.env.PRICE_CHANNEL_ID
    );

    if (!data) return;

    if (data.messageId === lastPriceMessageId) {
        console.log('⏸️ Те же цены — пропускаем');
        return;
    }

    lastPriceMessageId = data.messageId;

    await sendPriceEmbed(data.embed);
    await saveState();

    console.log('📈 GAG2 Stock Prices отправлены');
}

async function checkFallPrices() {
    console.log(
        '🍁📈 Проверка GAG2 Fall Stock Prices...'
    );

    const data =
        await fetchOriginalEmbed(
            '1533558976304775248',
            'Stock Prices',
            'Fall Prices'
        );

    if (!data) return;

    if (
        data.messageId ===
        lastFallPriceMessageId
    ) {
        console.log(
            '⏸️ Те же Fall Prices — пропускаем'
        );
        return;
    }

    await sendOriginalEmbed(
        data.embed,
        [
            process.env.PRICE_WEBHOOK_URL,
            process.env.KIRO_PRICE_WEBHOOK_URL
        ],
        'Fall Prices'
    );

    /*
        Запоминаем ID только после успешной попытки
        отправки.
    */
    lastFallPriceMessageId =
        data.messageId;

    await saveState();

    console.log(
        '🍁📈 GAG2 Fall Stock Prices отправлены'
    );
}

async function checkAuctions() {

    const minute = new Date().getUTCMinutes();

    if (minute % 30 !== 0) {
        return;
    }

    console.log('🛒 Проверка Auctions...');

    const data = await fetchAuctionEmbed(
        process.env.AUCTION_CHANNEL_ID
    );

    if (!data) return;

    if (data.messageId === lastAuctionMessageId) {
        console.log('⏸️ Тот же Auction — пропускаем');
        return;
    }

    lastAuctionMessageId = data.messageId;

    await sendAuctionEmbed(data.embed);
    await saveState();

    console.log('🛒 Auctions отправлены');
}

async function checkFallAuctions() {
    const minute =
        new Date().getUTCMinutes();

    /*
        Аукцион обновляется каждые 30 минут,
        как и обычный.
    */
    if (minute % 30 !== 0) {
        return;
    }

    console.log(
        '🍁🛒 Проверка GAG2 Fall Auctions...'
    );

    const data =
        await fetchOriginalEmbed(
            '1533558903361638551',
            'Auctions Stock',
            'Fall Auctions'
        );

    if (!data) return;

    if (
        data.messageId ===
        lastFallAuctionMessageId
    ) {
        console.log(
            '⏸️ Тот же Fall Auction — пропускаем'
        );
        return;
    }

    await sendOriginalEmbed(
        data.embed,
        [
            process.env.AUCTION_WEBHOOK_URL,
            process.env.KIRO_AUCTION_WEBHOOK_URL
        ],
        'Fall Auctions'
    );

    lastFallAuctionMessageId =
        data.messageId;

    await saveState();

    console.log(
        '🍁🛒 GAG2 Fall Auctions отправлены'
    );
}
    
// ===== ОСНОВНАЯ ПРОВЕРКА =====
async function checkAll() {
    console.log(`\n🕒 ${new Date().toLocaleTimeString()} - Проверка...`);

    if (isChecking) return;
    isChecking = true;

    try {
        if (ENABLE_GAG2_PRICES) {
            await checkPrices();
            await checkFallPrices();
        }

        if (ENABLE_GAG2_AUCTIONS) {
            await checkAuctions();
            await checkFallAuctions();
        }

        if (!ENABLE_PVB) {
            console.log('⏸️ PVB проверки выключены');
            return;
        }

        const seedData = await parseSeedsChannel(process.env.SEED_CHANNEL_ID);
        const gearData = await parseChannel(process.env.GEAR_CHANNEL_ID, 'gear');

        const normalSeeds = seedData.normal;
        const adminSeeds = seedData.admin;
        const adminMsgId = seedData.adminMessageId;

        const seedMsgId = seedData.normalMessageId;
        const gearMsgId = gearData?.messageId;

        const newGear = gearData?.items;

        const now = new Date();
        const currentHour = now.getUTCHours();
        const isTopOfHour = now.getMinutes() === 0;

        shouldIncludeAdmin = isTopOfHour && lastAdminSentHour !== currentHour;

        if (shouldIncludeAdmin) {
            console.log('🛠 ADMIN будет добавлен');
            lastAdminSentHour = currentHour;
        }

        const isSameStock =
            seedMsgId === stockData.lastSeedMessageId &&
            gearMsgId === stockData.lastGearMessageId;

        if (isSameStock && !shouldIncludeAdmin) {
            console.log('⏸️ Тот же сток — пропускаем');
            return;
        }

        stockData.lastSeedMessageId = seedMsgId;
        stockData.lastGearMessageId = gearMsgId;

        if (adminMsgId) {
            stockData.lastAdminMessageId = adminMsgId;
        }

        stockData.seeds = normalSeeds || [];
        stockData.gear = newGear || [];
        stockData.adminSeeds = adminSeeds || [];

        console.log('🚀 Отправляем PVB сток');

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

        let delay;

        if (seconds < 20) {
            delay = (20 - seconds) * 1000;
        } else {
            delay = (60 - seconds + 20) * 1000;
        }

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
