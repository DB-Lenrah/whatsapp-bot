const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const pino = require('pino');

// بيانات الجروبات الأصلية الخاصة بك
const groupInfo = {
    "1": { name: "البرمجة والتقنية", link: "https://chat.whatsapp.com/KHsm9hAJFBbFOp8fWN1erl?mode=gi_t" },
    "2": { name: "التصميم والمونتاج", link: "https://chat.whatsapp.com/CZUOT2QkozUAGfjYt0cCX3?mode=gi_t" },
    "3": { name: "التسويق وصناعة البيزنس", link: "https://chat.whatsapp.com/HYDuaLjRDTfCscBcfFKXYZ?mode=gi_t" },
    "4": { name: "صناعة المحتوى والإعلام", link: "https://chat.whatsapp.com/ER6FPfwy2uFAIDvy3IrlvY?mode=gi_t" },
    "5": { name: "الألعاب والأنمي", link: "https://chat.whatsapp.com/Eg2k96phbLu6Wts8u4f1ev?mode=gi_t" },
    "6": { name: "الربح والاستثمار", link: "https://chat.whatsapp.com/HVgVhW9ibH27aSVsSlAquz?mode=gi_t" },
    "7": { name: "التطوير الذاتي والمهارات", link: "https://chat.whatsapp.com/DBuFNBrSl9Y9ylu9CVV86S?mode=gi_t" },
    "8": { name: "دردشة عامة واهتمامات متنوعة", link: "https://chat.whatsapp.com/K7hPfCgjSUN0slBmKUJozx?mode=gi_t" }
};

const cooldowns = new Map();

function loadData() {
    if (!fs.existsSync('database.json')) return {};
    return JSON.parse(fs.readFileSync('database.json'));
}

function saveData(data) {
    fs.writeFileSync('database.json', JSON.stringify(data, null, 4));
}

function getRankInfo(points) {
    if (points >= 6301) return { name: "Grand Master 🌟", next: "القمة", req: 6301 };
    if (points >= 3101) return { name: "Master 👑", next: "Grand Master", req: 6301 };
    if (points >= 1501) return { name: "Diamond 🔥", next: "Master", req: 3101 };
    if (points >= 701)  return { name: "Platinum 💎", next: "Diamond", req: 1501 };
    if (points >= 301)  return { name: "Gold 🥇", next: "Platinum", req: 701 };
    if (points >= 101)  return { name: "Silver 🥈", next: "Gold", req: 301 };
    return { name: "Bronze 🔰", next: "Silver", req: 101 };
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    // --- نظام منع الدخول الخارجي (Gatekeeper) ---
    sock.ev.on('group-participants.update', async (anu) => {
        if (anu.action === 'add') {
            const db = loadData();
            for (const user of anu.participants) {
                // تعديل تقني لضمان قراءة معرف المستخدم بشكل صحيح وتجنب خطأ split
                const userId = typeof user === 'string' ? user : (user.id || user);
                const isAuthorized = db[userId] && db[userId].lastGroupRequested;
                
                if (!isAuthorized) {
                    await sock.sendMessage(anu.id, { text: `⚠️ عذراً @${userId.split('@')[0]}، الدخول مسموح فقط عبر بوت الواجهة الرئيسية.`, mentions: [userId] });
                    await sock.groupParticipantsUpdate(anu.id, [userId], 'remove');
                    await sock.sendMessage(userId, { text: "❌ تم طردك لأنك دخلت عبر رابط خارجي. من فضلك اطلب الرابط من البوت أولاً لتتمكن من البقاء في الجروب." });
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ البوت جاهز بنظام الحماية والنقاط المطور!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe || type !== 'notify') return;

        const remoteJid = m.key.remoteJid;
        const participant = m.key.participant || remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');
        const body = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
        const pushName = m.pushName || "مستخدم";
        
        let db = loadData();

        if (!db[participant]) {
            db[participant] = { points: 0, greeted: false, name: pushName, id: participant, joinedGroups: [] };
        }

        // --- نظام النقاط في الجروبات ---
        if (isGroup) {
            const now = Date.now();
            const lastSeen = cooldowns.get(participant) || 0;
            if (now - lastSeen > 3000) {
                db[participant].points += 2; // زيادة نقطتين فورا
                db[participant].name = pushName;
                cooldowns.set(participant, now);
                let currentRank = getRankInfo(db[participant].points);

                if (db[participant].points >= currentRank.req && currentRank.next !== "القمة") {
                    db[participant].points = 0; // تصفير عند الترقية
                    saveData(db);
                    await sock.sendMessage(remoteJid, { 
                        text: `🎊 كفو يا ${pushName}! ارتقيت لرتبة [ ${currentRank.next} ]\nتم تصفير نقاطك وبدأ تحدي الرتبة الجديدة! 🔥🚀`,
                        mentions: [participant]
                    });
                } else {
                    saveData(db);
                }
            }
            return;
        }

        const userPoints = db[remoteJid].points;
        const rank = getRankInfo(userPoints);
        if (!db[remoteJid].joinedGroups) db[remoteJid].joinedGroups = [];

        const sendText = async (txt) => {
            await sock.sendMessage(remoteJid, { text: txt });
        };

        const myNumber = '201515477230@s.whatsapp.net';

        // --- أمر تحديث السجلات ---
        if (body === 'تحديث') {
            db[remoteJid].joinedGroups = [];
            db[remoteJid].lastGroupRequested = null;
            saveData(db);
            await sendText("✅ تم تحديث سجلاتك بنجاح! يمكنك الآن اختيار جروبات جديدة من الواجهة الرئيسية.");
            return;
        }

        // --- أمر الإدارة ---
        if (remoteJid === myNumber && body.startsWith('!add')) {
            const args = body.split(' ');
            const pts = parseInt(args[1]);
            const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (target && !isNaN(pts)) {
                if (!db[target]) db[target] = { points: 0, greeted: false, name: "غير معروف", id: target, joinedGroups: [] };
                db[target].points += pts;
                saveData(db);
                await sendText(`✅ تم إضافة ${pts} نقطة بنجاح.`);
                return;
            }
        }

        // --- نصوص الواجهة الأصلية ---
        const sendMainMenu = async () => {
            await sendText(`✨ أهلاً بك في صفحتك الرئيسية ✨\n\nإنت دلوقتي في مكان معمول مخصوص لناس بتحب المحتوى التقيل 💪\n\n📌 اختار المجال اللي مهتم بيه واكتب رقمه:\n1️⃣ البرمجة والتقنية\n(برمجة – أمن معلومات – اختراق أخلاقي – ذكاء اصطناعي – أدوات تقنية)\n\n2️⃣ التصميم والمونتاج\n(جرافيك – مونتاج – موشن جرافيك – تصوير)\n\n3️⃣ التسويق وصناعة البيزنس\n(تسويق إلكتروني – سوشيال ميديا – تجارة إلكترونية – عمل حر)\n\n4️⃣ صناعة المحتوى والإعلام\n(يوتيوب – تيك توك – كتابة محتوى – بودكاست)\n\n5️⃣ الألعاب والأنمي\n(جيمينج – أخبار الألعاب – أنمي ومانجا – نقاشات وترشيحات)\n\n6️⃣ الربح والاستثمار\n(ربح من الإنترنت – تداول – استثمار – مشاريع جانبية)\n\n7️⃣ التطوير الذاتي والمهارات\n(إدارة وقت – تنظيم – مهارات شخصية – تعلم ذاتي)\n\n8️⃣ دردشة عامة واهتمامات متنوعة\n(نقاشات خفيفة – آراء – مواضيع عامة)\n\n🔄 إذا خرجت من جروباتك وتريد اختيار غيرها اكتب: تحديث\n✍️ اكتب رقم المجال... لأن اللي جاي تقيل 🔥😉`);
        };

        const num = parseInt(body);

        if (['16', 'ابدأ', 'هلا', '.'].includes(body) || !db[remoteJid].greeted) {
            db[remoteJid].greeted = true;
            saveData(db);
            await sendMainMenu();
        } 
        else if (num >= 1 && num <= 8) {
            const groupId = body;
            const selection = groupInfo[groupId];

            if (db[remoteJid].joinedGroups.includes(groupId)) {
                db[remoteJid].lastGroupRequested = selection.link;
                saveData(db);
                await sendText(`🔗 إليك رابط الانضمام لجروب [DB-Lenrah لـ ${selection.name}]:\n${selection.link}\n\nننتظرك هناك! 🚀`);
            } 
            else if (db[remoteJid].joinedGroups.length >= 2) {
                await sendText(`⚠️ عفواً! لا يمكنك الانضمام لأكثر من جروبين في نفس الوقت.\n\nأنت مشترك حالياً في:\n1️⃣ ${groupInfo[db[remoteJid].joinedGroups[0]].name}\n2️⃣ ${groupInfo[db[remoteJid].joinedGroups[1]].name}\n\nيجب عليك الخروج من أحدهما أولاً ثم كتابة كلمة *تحديث* لتتمكن من الانضمام لمجال جديد. 🚪`);
            } 
            else {
                db[remoteJid].joinedGroups.push(groupId);
                db[remoteJid].lastGroupRequested = selection.link;
                saveData(db);
                await sendText(`🔗 إليك رابط الانضمام لجروب [DB-Lenrah لـ ${selection.name}]:\n${selection.link}\n\nننتظرك هناك! 🚀`);
                
                setTimeout(async () => {
                    await sendText(`اختيار ممتاز🔥 الجروب ده مش دردشة فاضية...\n\n📩 اختار اللي حابب تعرفه واكتب رقمه:\n9️⃣ عرض نقاطي\n🔟 عرض رتبتي الحالية\n1️⃣1️⃣ معلومات الجروب\n2️⃣1️⃣ قوانين الجروب\n3️⃣1️⃣ فائدة الجروب\n4️⃣1️⃣ كيف تشارك صح\n5️⃣1️⃣ تواصل مع الإدارة\n6️⃣1️⃣ الواجهة الرئيسية\n✍️ اكتب الرقم وسيب الباقي علينا 😉🔥`);
                }, 2000);
            }
        } 
        else if (body === '9') {
            await sendText(`1️⃣ عرض نقاطي\n🎮 حسابك داخل الجروب\n⭐ نقاطك الحالية: [ ${userPoints} ] نقطة\n\n🏆 رتبتك الحالية: [ ${rank.name} ]\nكمّل تفاعل 🔥💪`);
        } 
        else if (body === '10') {
            await sendText(`2️⃣ عرض رتبتي الحالية\n🏅 رتبتك داخل الجروب: [ ${rank.name} ]\n📊 التقدم للرتبة التالية:\n\nنقاطك: [ ${userPoints} ] / [ ${rank.req} ]\nكل خطوة تقربك من القمة 👑🚀`);
        } 
        else if (body === '11') {
            await sendText(`3️⃣ معلومات الجروب والنظام\n📌 معلومات الجروب\nده جروب مجتمعي بيجمع بين:\n✔️ التقنية ✔️ المحتوى ✔️ النقاش ✔️ الترفيه\n\n🔹 نظام الجروب بيعتمد على النقاط والرتب\nالجروب معمول عشان اللي بيدي ياخد 👌`);
        } 
        else if (body === '12') {
            await sendText(`4️⃣ قوانين الجروب\n⚠️ قوانين بسيطة بس مهمة:\n✔️ الاحترام المتبادل\n✔️ الالتزام بالموضوع\n✔️ ممنوع السبام\nالنظام واضح وعادل ⚖️`);
        } 
        else if (body === '13') {
            await sendText(`5️⃣ مجال الجروب وإيه اللي ممكن تستفيده\n🎯 مجالات الجروب:\nتقنية، تصميم، تسويق، ألعاب، تطوير ذات.\n\nهنا وجودك مش رقم… وجودك قيمة ✨`);
        } 
        else if (body === '14') {
            await sendText(`6️⃣ ازاي تتفاعل وتشارك صح\n🚀 عايز تعلى بسرعة؟\n✔️ شارك بمعلومة مفيدة ✔️ اسأل سؤال ذكي ✔️ ساعد غيرك\nاللعب النضيف هو اللي يكسب 🕹️🔥`);
        } 
        else if (body === '15') {
            await sendText(`7️⃣ تواصل مع الإدارة\n👨‍💼 تواصل مع الإدارة\n📩 ابعت رسالة خاصة للأدمن:\n👉 [+201515477230]\nإحنا هنا نساعدك 🤝`);
        } 
        else {
            await sendMainMenu();
        }
    });
}

startBot();