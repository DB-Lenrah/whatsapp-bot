const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    jidDecode
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const pino = require('pino');
const mongoose = require('mongoose');
const axios = require('axios');
const http = require('http'); // تم الإضافة لإبقاء السيرفر حياً

/**
 * نظام DB-LENRAH المتكامل
 * الإصدار: 5.0 (الذكاء الاصطناعي والحماية القصوى - نسخة Railway المستقرة)
 */

// --- إضافة خادم ويب بسيط لمنع الـ Loop في Railway ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('System is Running...');
}).listen(port);

// --- إعداد الاتصال بـ MongoDB ---
const mongoURI = "mongodb+srv://mostafaabdalabsetmohammed_db_user:mstfbdlbaset@db-lenrah-database.0hng1tu.mongodb.net/?appName=DB-Lenrah-Database";

mongoose.connect(mongoURI).then(() => {
    console.log('✅ [DATABASE] تم الاتصال بقاعدة البيانات السحابية بنجاح!');
}).catch(err => console.error('❌ [DATABASE] خطأ في الاتصال:', err));

// --- تعريف الهيكل (Schema) المطور ---
const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    points: { type: Number, default: 0 },
    greeted: { type: Boolean, default: false },
    name: { type: String, default: "مستخدم" },
    joinedGroups: { type: Array, default: [] },
    lastGroupRequested: { type: String, default: null },
    isBanned: { type: Boolean, default: false },
    warningCount: { type: Number, default: 0 },
    lastInteraction: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// --- قاعدة بيانات رادار الإساءة ---
const badWords = [
    "شتم1", "شتم2", "اهانة", "بذيء", "قذر", "متخلف", "يا حيوان", "كلب", "حمار", "يا غبي",
    "لعنة", "تفو", "يا وطي", "يا زفت", "حقير", "سافل" 
];

// --- بيانات الجروبات كاملة بدون حذف ---
const groupInfo = {
    "1": { name: "البرمجة والتقنية", link: "https://chat.whatsapp.com/KHsm9hAJFBbFOp8fWN1erl?mode=gi_t", id: "1203630412345678@g.us" },
    "2": { name: "التصميم والمونتاج", link: "https://chat.whatsapp.com/CZUOT2QkozUAGfjYt0cCX3?mode=gi_t", id: "1203630412345679@g.us" },
    "3": { name: "التسويق وصناعة البيزنس", link: "https://chat.whatsapp.com/HYDuaLjRDTfCscBcfFKXYZ?mode=gi_t", id: "1203630412345680@g.us" },
    "4": { name: "صناعة المحتوى والإعلام", link: "https://chat.whatsapp.com/ER6FPfwy2uFAIDvy3IrlvY?mode=gi_t", id: "1203630412345681@g.us" },
    "5": { name: "الألعاب والأنمي", link: "https://chat.whatsapp.com/Eg2k96phbLu6Wts8u4f1ev?mode=gi_t", id: "1203630412345682@g.us" },
    "6": { name: "الربح والاستثمار", link: "https://chat.whatsapp.com/HVgVhW9ibH27aSVsSlAquz?mode=gi_t", id: "1203630412345683@g.us" },
    "7": { name: "التطوير الذاتي والمهارات", link: "https://chat.whatsapp.com/DBuFNBrSl9Y9ylu9CVV86S?mode=gi_t", id: "1203630412345684@g.us" },
    "8": { name: "دردشة عامة واهتمامات متنوعة", link: "https://chat.whatsapp.com/K7hPfCgjSUN0slBmKUJozx?mode=gi_t", id: "1203630412345685@g.us" }
};

// --- نظام الرتب ---
function getRankInfo(points) {
    if (points >= 6301) return { name: "Grand Master 🌟", req: 6301 };
    if (points >= 3101) return { name: "Master 👑", req: 3101 };
    if (points >= 1501) return { name: "Diamond 🔥", req: 1501 };
    if (points >= 701)  return { name: "Platinum 💎", req: 701 };
    if (points >= 301)  return { name: "Gold 🥇", req: 301 };
    if (points >= 101)  return { name: "Silver 🥈", req: 101 };
    return { name: "Bronze 🔰", req: 0 };
}

// --- محرك الذكاء الاصطناعي ---
async function chatGPT(text) {
    try {
        const response = await axios.get(`https://api.simsimi.vn/v1/simtalk?text=${encodeURIComponent(text)}&lc=ar`);
        return response.data.message;
    } catch (e) {
        return "أنا هنا معك، كيف يمكنني مساعدتك في تطوير مهاراتك اليوم؟ 🚀";
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // تم الإيقاف لتجنب التحذير وطباعته يدوياً تحت
        logger: pino({ level: 'silent' }),
        browser: ['DB-Lenrah', 'Chrome', '1.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    // تحديث الخلفية التلقائي
    setInterval(async () => {
        try {
            const now = new Date();
            await User.updateMany({ lastInteraction: { $lt: new Date(now - 30 * 60000) } }, { greeted: true });
        } catch (err) {}
    }, 3000);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        const participant = m.key.participant || remoteJid;
        const body = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.buttonsResponseMessage?.selectedButtonId || "").trim();
        const pushName = m.pushName || "مستخدم";
        
        const myAdminNumber = '201515477230@s.whatsapp.net';
        const myReportNumber = '201032170903@s.whatsapp.net'; 

        let userData = await User.findOne({ id: participant });
        if (!userData) {
            userData = new User({ id: participant, name: pushName });
            await userData.save();
        }

        userData.lastInteraction = new Date();
        await userData.save();

        if (userData.isBanned) return;

        // نظام رصد الإساءة
        const hasBadWord = badWords.some(word => body.toLowerCase().includes(word));
        if (hasBadWord) {
            await sock.sendMessage(myReportNumber, { 
                text: `🚨 *إشعار محاولة إساءة*\n\n👤 المستخدم: ${pushName}\n📱 الرقم: ${participant.split('@')[0]}\n💬 الرسالة: "${body}"\n\n⚠️ تم تعليق ردود البوت عليه مؤقتاً. هل تريد حظره؟\nاكتب: !ban ${participant.split('@')[0]}` 
            });
            await sock.sendMessage(remoteJid, { text: "⚠️ تم رصد كلمة غير لائقة. تم إرسال بلاغ للإدارة للمراجعة." });
            return;
        }

        // أوامر الإدارة السيادية
        if (participant === myAdminNumber) {
            const args = body.split(' ');
            const command = args[0];
            const amount = parseInt(args[1]);
            const target = args[2] ? args[2] + '@s.whatsapp.net' : null;

            if (command === '!add' && target) {
                await User.findOneAndUpdate({ id: target }, { $inc: { points: amount } }, { upsert: true });
                return sock.sendMessage(remoteJid, { text: `✅ تم إضافة ${amount} نقطة للرقم ${args[2]}` });
            }
            if (command === '!sub' && target) {
                await User.findOneAndUpdate({ id: target }, { $inc: { points: -amount } });
                return sock.sendMessage(remoteJid, { text: `📉 تم خصم ${amount} نقطة من الرقم ${args[2]}` });
            }
            if (command === '!addall') {
                await User.updateMany({}, { $inc: { points: amount } });
                return sock.sendMessage(remoteJid, { text: `🌟 تم توزيع ${amount} نقطة كهدية لكل المستخدمين!` });
            }
            if (command === '!ban' && args[1]) {
                const jid = args[1] + '@s.whatsapp.net';
                await User.findOneAndUpdate({ id: jid }, { isBanned: true }, { upsert: true });
                return sock.sendMessage(remoteJid, { text: `🚫 تم حظر الرقم ${args[1]} نهائياً من النظام.` });
            }
            if (command === '!unban' && args[1]) {
                const jid = args[1] + '@s.whatsapp.net';
                await User.findOneAndUpdate({ id: jid }, { isBanned: false });
                return sock.sendMessage(remoteJid, { text: `✅ تم فك الحظر عن الرقم ${args[1]}.` });
            }
        }

        const sendMainMenu = async () => {
            await sock.sendMessage(remoteJid, { text: `✨ أهلاً بك في صفحتك الرئيسية ✨\n\nإنت دلوقتي في مكان معمول مخصوص لناس بتحب المحتوى التقيل 💪\n\n📌 اختار المجال اللي مهتم بيه واكتب رقمه:\n1️⃣ البرمجة والتقنية\n(برمجة – أمن معلومات – اختراق أخلاقي – ذكاء اصطناعي – أدوات تقنية)\n\n2️⃣ التصميم والمونتاج\n(جرافيك – مونتاج – موشن جرافيك – تصوير)\n\n3️⃣ التسويق وصناعة البيزنس\n(تسويق إلكتروني – سوشيال ميديا – تجارة إلكترونية – عمل حر)\n\n4️⃣ صناعة المحتوى والإعلام\n(يوتيوب – تيك توك – كتابة محتوى – بودكاست)\n\n5️⃣ الألعاب والأنمي\n(جيمينج – أخبار الألعاب – أنمي ومانجا – نقاشات وترشيحات)\n\n6️⃣ الربح والاستثمار\n(ربح من الإنترنت – تداول – استثمار – مشاريع جانبية)\n\n7️⃣ التطوير الذاتي والمهارات\n(إدارة وقت – تنظيم – مهارات شخصية – تعلم ذاتي)\n\n8️⃣ دردشة عامة واهتمامات متنوعة\n(نقاشات خفيفة – آراء – مواضيع عامة)\n\n🔄 إذا خرجت من جروباتك وتريد اختيار غيرها اكتب: تحديث\n✍️ اكتب رقم المجال... لأن اللي جاي تقيل 🔥😉` });
        };

        const rank = getRankInfo(userData.points);
        const num = parseInt(body);

        if (['16', 'ابدأ', 'هلا', '.', 'menu', 'الرئيسية'].includes(body.toLowerCase()) || !userData.greeted) {
            userData.greeted = true; await userData.save();
            await sendMainMenu();
        } 
        else if (num >= 1 && num <= 8) {
            if (userData.joinedGroups.length >= 2 && !userData.joinedGroups.includes(body)) {
                await sock.sendMessage(remoteJid, { text: `⚠️ عفواً! لا يمكنك الانضمام لأكثر من جروبين في نفس الوقت.\n\nأنت مشترك حالياً في:\n1️⃣ ${groupInfo[userData.joinedGroups[0]]?.name}\n2️⃣ ${groupInfo[userData.joinedGroups[1]]?.name}\n\nيجب عليك الخروج من أحدهما أولاً ثم كتابة كلمة *تحديث* لتتمكن من الانضمام لمجال جديد. 🚪` });
            } else {
                if (!userData.joinedGroups.includes(body)) {
                    userData.joinedGroups.push(body);
                    await userData.save();
                }
                const selection = groupInfo[body];
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
        else if (body === '15') {
            await sock.sendMessage(remoteJid, { text: `7️⃣ تواصل مع الإدارة\n👨‍💼 تواصل مع الإدارة\n📩 ابعت رسالة خاصة للأدمن:\n👉 [+201515477230]\nإحنا هنا نساعدك 🤝` });
        }
        else if (body === 'تحديث') {
            userData.joinedGroups = []; await userData.save();
            await sock.sendMessage(remoteJid, { text: "✅ تم تحديث سجلاتك بنجاح! يمكنك الآن اختيار مجالات جديدة." });
        }
        else {
            const aiReply = await chatGPT(body);
            await sock.sendMessage(remoteJid, { text: `🤖 *مساعد DB-LENRAH الذكي:*\n\n${aiReply}` });
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        const myReportNumber = '201032170903@s.whatsapp.net';
        if (action === 'add') {
            for (let userJid of participants) {
                let user = await User.findOne({ id: userJid });
                if (user && user.joinedGroups.length > 2) {
                    await sock.sendMessage(myReportNumber, { 
                        text: `🛡️ *رادار الحماية*\n\n⚠️ المستخدم: @${userJid.split('@')[0]} دخل جروب "${id}" وهو مشترك بالفعل في جروبين!\n\nيجب اتخاذ إجراء ضده.`,
                        mentions: [userJid]
                    });
                }
            }
        }
    });

    // --- نظام الاتصال المصلح ليعرض الـ QR مرة واحدة ويوقف الـ Loop ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--------------------------------------------------');
            console.log('📩 كود الـ QR جاهز للمسح الآن:');
            qrcode.generate(qr, { small: true });
            console.log('--------------------------------------------------');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 جاري محاولة إعادة الاتصال خلال 10 ثوانٍ...');
                setTimeout(() => startBot(), 10000);
            } else {
                console.log('🚫 تم تسجيل الخروج. يرجى مسح الـ QR من جديد.');
            }
        } else if (connection === 'open') {
            console.log('✅ [SUCCESS] تم تشغيل البوت بنجاح وهو الآن متاح للخدمة!');
        }
    });
}

startBot();