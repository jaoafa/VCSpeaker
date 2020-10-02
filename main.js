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

const voiceText = new VoiceText(voicetextAPIKey);
const bot = new eris(token);

let textChannel = null;
let connection = null;
let textBuffer = [];

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

    addSpeakMsg(`${member.username} joined to ${channel.name}`);
});
bot.on("voiceChannelSwitch", (member, oldChannel, newChannel) => {
    if (channel.guild.id != "597378876556967936") {
        return;
    }
    console.log("voiceChannelSwitch:" + member.username + " / " + oldChannel.name + " -> " + newChannel.name);

    if (connection != null && oldChannel.id == connection.channelID && oldChannel.voiceMembers.filter(member => !member.bot).length == 0) {
        bot.leaveVoiceChannel(connection.channelID);
        connection = null;
    }

    addSpeakMsg(`${member.username} joined to ${newChannel.name} from ${oldChannel.name}`);
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

    addSpeakMsg(`${member.username} left from ${channel.name}`);
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
    if (msg.content == prefix + "refresh") {
        textBuffer.clear();
        msg.addReaction("⭕");
        return;
    }

    if (!connection) {
        if (msg.member.voiceState.channelID != null) {
            joinVC(msg.member.voiceState.channelID);
        } else {
            msg.addReaction("❌");
            return;
        }
    }
    if (addSpeakMsg(replaceMentions(msg)) == false) {
        msg.addReaction("❌");
    }
});

function addSpeakMsg(content) {
    const speaker = getSpeaker(content);
    const speed = getSpeed(content);
    content = replaceSpeakMessage(content);
    if (content.length == 0) {
        return false;
    }
    if (!connection) {
        return;
    }
    console.log(`addSpeakMsg: ${speaker} ${content}`);
    if (connection.playing) {
        textBuffer.push({
            voice: speaker,
            msg: content,
            speed: speed
        });
    } else {
        var error = getSpeakStream({
            voice: speaker,
            msg: content,
            speed: speed
        });
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

function replaceSpeakMessage(content) {
    content = content.replace(new RegExp("speaker:[A-Za-z0-9]+", "g"), "");
    content = content.replace(new RegExp("speed:[A-Za-z0-9]+", "g"), "");
    content = content.replace(/<a?:(.+?):([0-9]+)>/g, "$1");
    // text = EmojiParser.parseToAliases(text);

    // EmojiParser-jar-with-dependencies.jar
    const tempPath = tempfile();
    fs.writeFileSync(tempPath, content);
    content = execSync(`java -jar ${__dirname}/EmojiParser-jar-with-dependencies.jar ${tempPath}`).toString();
    fs.unlinkSync(tempPath);

    return content;
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

        const stream = voiceText.stream(obj.msg.slice(0, 200), ret);
        connection.play(stream);
    } catch (err) {
        if (err.message.includes("Not ready yet")) {
            connection = null;
        }
        console.log(err);
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
            connection.on("end", () => {
                console.log("on(end)");
                connection.removeAllListeners();
                if (textBuffer.length) {
                    getSpeakStream(textBuffer.shift());
                }
            })
        });
}

bot.connect();