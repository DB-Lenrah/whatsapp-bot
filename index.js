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
const mongoose = require('mongoose');

// --- إعداد الاتصال بـ MongoDB ---
const mongoURI = "mongodb+srv://mostafaabdalabsetmohammed_db_user:mstfbdlbaset@db-lenrah-database.0hng1tu.mongodb.net/?appName=DB-Lenrah-Database";

mongoose.connect(mongoURI).then(() => {
    console.log('✅ تم الاتصال بقاعدة البيانات السحابية بنجاح!');
}).catch(err => console.error('❌ خطأ في الاتصال بـ MongoDB:', err));

// تعريف الهيكل (Schema) المطور
const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    points: { type: Number, default: 0 },
    greeted: { type: Boolean, default: false },
    name: { type: String, default: "مستخدم" },
    joinedGroups: { type: Array, default: [] },
    lastGroupRequested: { type: String, default: null },
    isBanned: { type: Boolean, default: false } // نظام الحظر
});
const User = mongoose.model('User', UserSchema);

// قائمة الكلمات المسيئة
const badWords = ["شتم1", "شتم2", "اهانة"]; 

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

function getRankInfo(points) {
    if (points >= 6301) return { name: "Grand Master 🌟", req: 6301, level: 7 };
    if (points >= 3101) return { name: "Master 👑", req: 3101, level: 6 };
    if (points >= 1501) return { name: "Diamond 🔥", req: 1501, level: 5 };
    if (points >= 701)  return { name: "Platinum 💎", req: 701, level: 4 };
    if (points >= 301)  return { name: "Gold 🥇", req: 301, level: 3 };
    if (points >= 101)  return { name: "Silver 🥈", req: 101, level: 2 };
    return { name: "Bronze 🔰", req: 0, level: 1 };
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        const participant = m.key.participant || remoteJid;
        const body = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
        const pushName = m.pushName || "مستخدم";
        
        const myAdminNumber = '201515477230@s.whatsapp.net';
        const myReportNumber = '2010332170903@s.whatsapp.net';

        let userData = await User.findOne({ id: participant });
        if (!userData) {
            userData = new User({ id: participant, name: pushName });
            await userData.save();
        }

        // --- فحص الحظر ---
        if (userData.isBanned) return;

        // --- رصد الإساءة ---
        const hasBadWord = badWords.some(word => body.includes(word));
        if (hasBadWord) {
            await sock.sendMessage(myReportNumber, { 
                text: `🚨 *بلاغ إساءة*\n👤 المستخدم: ${pushName}\n📱 الرقم: ${participant.split('@')[0]}\n💬 الرسالة: "${body}"` 
            });
        }

        // --- أوامر الإدارة (من رقمك فقط) ---
        if (participant === myAdminNumber) {
            const args = body.split(' ');
            const command = args[0];
            const amount = parseInt(args[1]);
            const target = args[2];

            if (command === '!add' && target) {
                const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;
                await User.findOneAndUpdate({ id: jid }, { $inc: { points: amount } }, { upsert: true });
                return sock.sendMessage(remoteJid, { text: `✅ تم إضافة ${amount} نقطة للرقم ${target}` });
            }
            if (command === '!sub' && target) {
                const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;
                const u = await User.findOne({ id: jid });
                if (u) { u.points = Math.max(0, u.points - amount); await u.save(); }
                return sock.sendMessage(remoteJid, { text: `📉 تم خصم ${amount} نقطة من الرقم ${target}` });
            }
            if (command === '!addall') {
                await User.updateMany({}, { $inc: { points: amount } });
                return sock.sendMessage(remoteJid, { text: `🌟 تم زيادة ${amount} نقطة للكل!` });
            }
            if (command === '!suball') {
                const all = await User.find({});
                for(let u of all) { u.points = Math.max(0, u.points - amount); await u.save(); }
                return sock.sendMessage(remoteJid, { text: `📉 تم خصم ${amount} نقطة من الكل!` });
            }
            // أمر الحظر
            if (command === '!ban' && target) {
                const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;
                await User.findOneAndUpdate({ id: jid }, { isBanned: true }, { upsert: true });
                return sock.sendMessage(remoteJid, { text: `🚫 تم حظر الرقم ${target} نهائياً.` });
            }
            if (command === '!unban' && target) {
                const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;
                await User.findOneAndUpdate({ id: jid }, { isBanned: false });
                return sock.sendMessage(remoteJid, { text: `✅ تم فك الحظر عن ${target}.` });
            }
        }

        // --- نصوص الرسائل الأصلية بالكامل ---
        const sendMainMenu = async () => {
            await sock.sendMessage(remoteJid, { text: `✨ أهلاً بك في صفحتك الرئيسية ✨\n\nإنت دلوقتي في مكان معمول مخصوص لناس بتحب المحتوى التقيل 💪\n\n📌 اختار المجال اللي مهتم بيه واكتب رقمه:\n1️⃣ البرمجة والتقنية\n(برمجة – أمن معلومات – اختراق أخلاقي – ذكاء اصطناعي – أدوات تقنية)\n\n2️⃣ التصميم والمونتاج\n(جرافيك – مونتاج – موشن جرافيك – تصوير)\n\n3️⃣ التسويق وصناعة البيزنس\n(تسويق إلكتروني – سوشيال ميديا – تجارة إلكترونية – عمل حر)\n\n4️⃣ صناعة المحتوى والإعلام\n(يوتيوب – تيك توك – كتابة محتوى – بودكاست)\n\n5️⃣ الألعاب والأنمي\n(جيمينج – أخبار الألعاب – أنمي ومانجا – نقاشات وترشيحات)\n\n6️⃣ الربح والاستثمار\n(ربح من الإنترنت – تداول – استثمار – مشاريع جانبية)\n\n7️⃣ التطوير الذاتي والمهارات\n(إدارة وقت – تنظيم – مهارات شخصية – تعلم ذاتي)\n\n8️⃣ دردشة عامة واهتمامات متنوعة\n(نقاشات خفيفة – آراء – مواضيع عامة)\n\n🔄 إذا خرجت من جروباتك وتريد اختيار غيرها اكتب: تحديث\n✍️ اكتب رقم المجال... لأن اللي جاي تقيل 🔥😉` });
        };

        const rank = getRankInfo(userData.points);
        const num = parseInt(body);

        if (['16', 'ابدأ', 'هلا', '.'].includes(body) || !userData.greeted) {
            userData.greeted = true; await userData.save();
            await sendMainMenu();
        } 
        else if (num >= 1 && num <= 8) {
            if (userData.joinedGroups.length >= 2 && !userData.joinedGroups.includes(body)) {
                await sock.sendMessage(remoteJid, { text: `⚠️ عفواً! لا يمكنك الانضمام لأكثر من جروبين في نفس الوقت.\n\nأنت مشترك حالياً في:\n1️⃣ ${groupInfo[userData.joinedGroups[0]]?.name}\n2️⃣ ${groupInfo[userData.joinedGroups[1]]?.name}\n\nيجب عليك الخروج من أحدهما أولاً ثم كتابة كلمة *تحديث* لتتمكن من الانضمام لمجال جديد. 🚪` });
            } else {
                if (!userData.joinedGroups.includes(body)) userData.joinedGroups.push(body);
                const selection = groupInfo[body];
                userData.lastGroupRequested = selection.link; await userData.save();
                
                await sock.sendMessage(remoteJid, { text: `🔗 إليك رابط الانضمام لجروب [DB-Lenrah لـ ${selection.name}]:\n${selection.link}\n\nننتظرك هناك! 🚀` });
                await sock.sendMessage(remoteJid, { text: `اختيار ممتاز🔥 الجروب ده مش دردشة فاضية...\n\n📩 اختار اللي حابب تعرفه واكتب رقمه:\n9️⃣ عرض نقاطي\n🔟 عرض رتبتي الحالية\n1️⃣1️⃣ معلومات الجروب\n2️⃣1️⃣ قوانين الجروب\n3️⃣1️⃣ فائدة الجروب\n4️⃣1️⃣ كيف تشارك صح\n5️⃣1️⃣ تواصل مع الإدارة\n6️⃣1️⃣ الواجهة الرئيسية\n✍️ اكتب الرقم وسيب الباقي علينا 😉🔥` });
            }
        } 
        else if (body === '9') {
            await sock.sendMessage(remoteJid, { text: `1️⃣ عرض نقاطي\n🎮 حسابك داخل الجروب\n⭐ نقاطك الحالية: [ ${userData.points} ] نقطة\n\n🏆 رتبتك الحالية: [ ${rank.name} ]\nكمّل تفاعل 🔥💪` });
        } 
        else if (body === '10') {
            await sock.sendMessage(remoteJid, { text: `2️⃣ عرض رتبتي الحالية\n🏅 رتبتك داخل الجروب: [ ${rank.name} ]\n📊 التقدم للرتبة التالية:\n\nنقاطك: [ ${userData.points} ] / [ ${rank.req} ]\nكل خطوة تقربك من القمة 👑🚀` });
        }
        else if (body === '11') { await sock.sendMessage(remoteJid, { text: `3️⃣ معلومات الجروب والنظام\n📌 معلومات الجروب\nده جروب مجتمعي بيجمع بين:\n✔️ التقنية ✔️ المحتوى ✔️ النقاش ✔️ الترفيه\n\n🔹 نظام الجروب بيعتمد على النقاط والرتب\nالجروب معمول عشان اللي بيدي ياخد 👌` }); }
        else if (body === '12') { await sock.sendMessage(remoteJid, { text: `4️⃣ قوانين الجروب\n⚠️ قوانين بسيطة بس مهمة:\n✔️ الاحترام المتبادل\n✔️ الالتزام بالموضوع\n✔️ ممنوع السبام\nالنظام واضح وعادل ⚖️` }); }
        else if (body === '13') { await sock.sendMessage(remoteJid, { text: `5️⃣ مجال الجروب وإيه اللي ممكن تستفيده\n🎯 مجالات الجروب:\nتقنية، تصميم، تسويق، ألعاب، تطوير ذات.\n\nهنا وجودك مش رقم… وجودك قيمة ✨` }); }
        else if (body === '14') { await sock.sendMessage(remoteJid, { text: `6️⃣ ازاي تتفاعل وتشارك صح\n🚀 عايز تعلى بسرعة؟\n✔️ شارك بمعلومة مفيدة ✔️ اسأل سؤال ذكي ✔️ ساعد غيرك\nاللعب النضيف هو اللي يكسب 🕹️🔥` }); }
        else if (body === '15') { await sock.sendMessage(remoteJid, { text: `7️⃣ تواصل مع الإدارة\n👨‍💼 تواصل مع الإدارة\n📩 ابعت رسالة خاصة للأدمن:\n👉 [+201515477230]\nإحنا هنا نساعدك 🤝` }); }
        else if (body === 'تحديث') {
            userData.joinedGroups = []; userData.lastGroupRequested = null; await userData.save();
            await sock.sendMessage(remoteJid, { text: "✅ تم تحديث سجلاتك بنجاح! يمكنك الآن اختيار جروبات جديدة." });
        }
        else {
            if (body.toLowerCase().includes("مين")) {
                await sock.sendMessage(remoteJid, { text: "أنا بوت DB-Lenrah، بساعدك تطور مهاراتك وتدخل مجتمعاتنا. اكتب 'ابدأ' للبدء." });
            } else { await sendMainMenu(); }
        }
    });

    sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
        console.log("-----------------------------------------");
        console.log("📷 SCAN THE QR CODE BELOW:");
        qrcode.generate(qr, { small: true });
        console.log("-----------------------------------------");
    }
    if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) startBot();
    } else if (connection === 'open') {
        console.log('✅ البوت متصل الآن وشغال!');
    }
});

}
startBot();