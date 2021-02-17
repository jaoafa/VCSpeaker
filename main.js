const {
    prefix,
    voicetextAPIKey,
    token,
} = require("./config.json");
const eris = require("eris");
const {
    VoiceText
} = require("voice-text");
const {
    exit
} = require("process");
const tempfile = require("tempfile");
const {
    execSync
} = require("child_process");
const fs = require("fs");
const url = require("url");

const voiceText = new VoiceText(voicetextAPIKey);
const bot = new eris(token);

let textChannel = null;
let connection = null;
let textBuffer = [];
let speakingMessage = null;

bot.on("ready", () => {
    console.log("Ready! " + bot.user.username);
});

bot.on("voiceChannelJoin", (member, channel) => {
    if (channel.guild.id != "597378876556967936") {
        return;
    }
    console.log("voiceChannelJoin:" + member.username + " / " + channel.name);

    if (connection == null && !member.bot) {
        joinVC(channel.id);
    }

    addSpeakMsg(null, `${member.username} joined to ${channel.name}`, false);
});
bot.on("voiceChannelSwitch", (member, oldChannel, newChannel) => {
    if (oldChannel.guild.id != "597378876556967936") {
        return;
    }
    console.log("voiceChannelSwitch:" + member.username + " / " + oldChannel.name + " -> " + newChannel.name);

    if (connection != null && oldChannel.id == connection.channelID && oldChannel.voiceMembers.filter(member => !member.bot).length == 0) {
        bot.leaveVoiceChannel(connection.channelID);
        connection = null;
    }

    addSpeakMsg(null, `${member.username} joined to ${newChannel.name} from ${oldChannel.name}`, false);
});
bot.on("voiceChannelLeave", (member, channel) => {
    if (channel.guild.id != "597378876556967936") {
        return;
    }
    console.log("voiceChannelLeave:" + member.username + " / " + channel.name);

    if (connection != null && channel.id == connection.channelID && channel.voiceMembers.filter(member => !member.bot).length == 0) {
        bot.leaveVoiceChannel(connection.channelID);
        connection = null;
    }

    addSpeakMsg(null, `${member.username} left from ${channel.name}`, false);
});
bot.on("messageCreate", (msg) => {
    if (msg.author.bot) return;

    if (msg.channel.guild.id != "597378876556967936") return; // jMS Gamers Club

    if (msg.channel.id != "623153228267388958") return; // #vc

    textChannel = msg.channel;

    console.log(`${msg.author.username}: ${msg.content} / ${textBuffer.length}`);

    if (msg.content == prefix + "summon") {
        if (msg.member.voiceState.channelID != null) {
            joinVC(msg.member.voiceState.channelID);
            return;
        }
        msg.addReaction("❌");
        return;
    }
    if (msg.content == prefix + "disconnect") {
        if (connection) {
            bot.leaveVoiceChannel(connection.channelID)
            return;
        }
        msg.addReaction("❌");
        return;
    }
    if (msg.content == prefix + "clear") {
        textBuffer.clear();
        msg.addReaction("⭕");
        return;
    }
    if (msg.content == prefix + "restart") {
        bot.disconnect();
        process.exit(0);
    }
    if (msg.content.startsWith(prefix + "alias ")) {
        const args = msg.content.split(" ");
        if (args[1] == "add") {
            const from = args[2];
            const to = args[3];
            addAlias(from, to);
            msg.channel.createMessage(`<@${msg.author.id}> addAlias: ${from} -> ${to}`);
            return;
        } else if (args[1] == "remove") {
            const from = args[2];
            removeAlias(from);
            msg.channel.createMessage(`<@${msg.author.id}> removeAlias: ${from}`);
            return;
        } else if (args[1] == "list") {
            const alias = JSON.parse(fs.readFileSync("./alias.json", "utf8"));
            const list = [];
            for (from in alias) {
                const to = alias[from];
                list.push(`${from} -> ${to}`);
            }
            msg.channel.createMessage(`<@${msg.author.id}>\`\`\`${list.join("\n")}\`\`\``);
            return;
        }
        msg.channel.createMessage(`<@${msg.author.id}> \`${prefix}alias <add|remove|list> [from] [to]\``);
        return;
    }
    if (msg.content == prefix + "restart") {
        bot.disconnect();
        process.exit(0);
    }

    if (!connection) {
        if (msg.member.voiceState.channelID != null) {
            joinVC(msg.member.voiceState.channelID);
        } else {
            msg.addReaction("❌");
            return;
        }
    }
    if (addSpeakMsg(msg, replaceMentions(msg), true) == false) {
        msg.addReaction("❌");
    }
});

function addSpeakMsg(msg, content, speakEmoji = true) {
    const speaker = getSpeaker(content);
    let speed = getSpeed(content);
    if (content.length >= 200 && speed == undefined) {
        speed = 400;
    }
    const pitch = getPitch(content);
    const emotion = getEmotion(content);
    content = replaceSpeakMessage(content, speakEmoji);
    if (content.length == 0) {
        return false;
    }
    if (content == ".") {
        return false;
    }
    if (!connection) {
        return;
    }
    console.log(`addSpeakMsg: ${content} -> speaker: ${speaker} / speed: ${speed} / pitch: ${pitch} / emotion: ${emotion}`);
    if (connection.playing) {
        for (let i = 0; i < content.length / 200; i++) {
            const _content = content.substr(i * 200, 200);
            textBuffer.push({
                message: msg,
                voice: speaker,
                msg: _content,
                speed: speed,
                pitch: pitch,
                emotion: emotion
            });
        }
    } else {
        let error = false;
        for (let i = 0; i < content.length / 200; i++) {
            const _content = content.substr(i * 200, 200);
            const _error = getSpeakStream({
                message: msg,
                voice: speaker,
                msg: _content,
                speed: speed,
                pitch: pitch,
                emotion: emotion
            });
            if (!error && _error) error = true;
        }
        if (error) {
            return false;
        }
    }
    return true;
}

// speaker:からスピーカーを取得。
function getSpeaker(msg) {
    const args = msg.split(" ");
    for (arg of args) {
        if (!arg.startsWith("speaker:")) {
            continue;
        }
        return arg.substring("speaker:".length);
    }
}

function getSpeed(msg) {
    const args = msg.split(" ");
    for (arg of args) {
        if (!arg.startsWith("speed:")) {
            continue;
        }
        return arg.substring("speed:".length);
    }
    return undefined;
}

function getPitch(msg) {
    const args = msg.split(" ");
    for (arg of args) {
        if (!arg.startsWith("pitch:")) {
            continue;
        }
        return arg.substring("pitch:".length);
    }
    return undefined;
}

function getEmotion(msg) {
    const args = msg.split(" ");
    for (arg of args) {
        if (!arg.startsWith("emotion:")) {
            continue;
        }
        if (arg.substring("emotion:".length).startsWith("happy")) {
            return "happiness";
        } else if (arg.substring("emotion:".length).startsWith("anger")) {
            return "anger";
        } else if (arg.substring("emotion:".length).startsWith("sadness")) {
            return "sadness";
        }
    }
    return undefined;
}

function replaceMentions(msg) {
    let content = msg.content;
    for (mention of msg.mentions) {
        content = content.replace(new RegExp(`<@!?${mention.id}>`, "g"), `@${mention.username}#${mention.discriminator}`);
    }
    for (roleId of msg.roleMentions) {
        const role = msg.channel.guild.roles.get(roleId)
        content = content.replace(`<@&${roleId}>`, `@${role.name}`);
    }
    return content;
}

function replaceSpeakMessage(content, speakEmoji) {
    content = content.replace(new RegExp("speaker:[A-Za-z0-9]+", "g"), "");
    content = content.replace(new RegExp("speed:[A-Za-z0-9]+", "g"), "");
    content = content.replace(new RegExp("pitch:[A-Za-z0-9]+", "g"), "");
    content = content.replace(new RegExp("emotion:[A-Za-z0-9]+", "g"), "");
    content = content.replace(/<a?:(.+?):([0-9]+)>/g, "$1");
    content = replaceAlias(content);
    // text = EmojiParser.parseToAliases(text);

    // EmojiParser-jar-with-dependencies.jar
    const tempPath = tempfile();
    fs.writeFileSync(tempPath, content);
    content = execSync(`java -jar ${__dirname}/EmojiParser-jar-with-dependencies.jar ${tempPath}`).toString();
    fs.unlinkSync(tempPath);
    if (!speakEmoji) {
        content = content.replace(new RegExp(":([a-zA-Z0-9]+):", "g"), "");
    }

    // url to title or filename

    content = content.replace(new RegExp("https?://([\\w-]+\.)+[\\w-]+(/[\\w-.?%&=]*)?", "g"), (match) => {
        return url.parse(match).pathname.slice(url.parse(match).pathname.indexOf("/") + 1) == "" ? url.parse(match).hostname : url.parse(match).pathname.slice(url.parse(match).pathname.indexOf("/") + 1);
    });
    content = content.replace("%20", " ");

    return content;
}

function replaceAlias(content) {
    const alias = JSON.parse(fs.readFileSync("./alias.json", "utf8"));
    const keys = Object.keys(alias).sort(function (a, b) {
        return b.length - a.length;
    });
    for (let key of keys) {
        const value = alias[key];
        if (content.indexOf(key) >= 0) {
            content = content.replace(new RegExp(key, "g"), value);
        }
    }
    return content;
}

function addAlias(from, to) {
    let alias = JSON.parse(fs.readFileSync("./alias.json", "utf8"));
    alias[from] = to;
    fs.writeFileSync("./alias.json", JSON.stringify(alias));
}

function removeAlias(from) {
    let alias = JSON.parse(fs.readFileSync("./alias.json", "utf8"));
    alias[from] = undefined;
    fs.writeFileSync("./alias.json", JSON.stringify(alias));
}

// speaker:とか消す
function getSpeakStream(obj) {
    if (obj.voice == undefined) obj.voice = "hikari";
    if (obj.speed == undefined && (obj.msg.includes("http:") || obj.msg.includes("https:"))) {
        obj.speed = 200;
    }
    if (!connection) return;
    try {
        let ret = {};
        ret.speaker = obj.voice;
        if (obj.speed != undefined) ret.speed = obj.speed;
        if (obj.pitch != undefined) ret.pitch = obj.pitch;
        if (obj.emotion != undefined) ret.emotion = obj.emotion;

        const stream = voiceText.stream(obj.msg.slice(0, 200), ret);
        if (obj.message != null) {
            obj.message.addReaction("🗣️").catch(err => console.log(err));
            speakingMessage = obj.message;
        }
        connection.play(stream);
    } catch (err) {
        if (err.message.includes("Not ready yet")) {
            connection = null;
        } else if (err.message.includes("Already encoding")) {
            try {
                // retry
                let ret = {};
                ret.speaker = obj.voice;
                if (obj.speed != undefined) ret.speed = obj.speed;
                if (obj.pitch != undefined) ret.pitch = obj.pitch;
                if (obj.emotion != undefined) ret.emotion = obj.emotion;

                const stream = voiceText.stream(obj.msg.slice(0, 200), ret);
                if (obj.message != null) {
                    obj.message.addReaction("🗣️").catch(err => console.log(err));
                    speakingMessage = obj.message;
                }
                connection.play(stream);
            } catch (err2) {
                console.log(err2);
                if (obj.message != null) obj.message.addReaction("❌").catch(err2 => console.log(err2));
                if (obj.message != null) obj.message.channel.createMessage(`<@${obj.message.author.id}> Error(2): \`\`\`${err2.message}\`\`\``);
            }
        } else {
            console.log(err);
            if (obj.message != null) obj.message.addReaction("❌").catch(err => console.log(err));
            if (obj.message != null) obj.message.channel.createMessage(`<@${obj.message.author.id}> Error: \`\`\`${err.message}\`\`\``);
        }
    }
    /*
    var url = voiceText.fetchBuffer(obj.msg, {
        speaker: obj.voice
    }).then(buffer => {
        try {
            JSON.parse(buffer.toString("utf-8"));
            console.log(buffer.toString("utf-8"));
        } catch (e) {
            var stream = require("buffer-to-stream")(buffer);
            connection.play(stream);
        }
    });
    */
}

function joinVC(channelID) {
    bot
        .joinVoiceChannel(channelID)
        .then((con) => {
            connection = con;
            connection.on("end", async () => {
                console.log(`on(end) ${textBuffer.length}`);
                // connection.removeAllListeners();
                if (speakingMessage != null) {
                    await speakingMessage.removeReaction("🗣️");
                }
                if (textBuffer.length) {
                    getSpeakStream(textBuffer.shift());
                }
            })
        });
}

bot.connect();