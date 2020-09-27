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

const voiceText = new VoiceText(voicetextAPIKey);
const bot = new eris(token);

let nowChannel = null;
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
    addSpeakMsg(`${member.username} joined to ${channel.name}`);
});
bot.on("voiceChannelSwitch", (member, oldChannel, newChannel) => {
    if (channel.guild.id != "597378876556967936") {
        return;
    }
    console.log("voiceChannelSwitch:" + member.username + " / " + oldChannel.name + " -> " + newChannel.name);
    addSpeakMsg(`${member.username} joined to ${newChannel.name} from ${oldChannel.name}`);
});
bot.on("voiceChannelLeave", (member, channel) => {
    if (channel.guild.id != "597378876556967936") {
        return;
    }
    console.log("voiceChannelLeave:" + member.username + " / " + channel.name);
    addSpeakMsg(`${member.username} left ${channel.name}`);
});
bot.on("messageCreate", (msg) => {
    if (msg.author.bot) return;

    if (msg.channel.guild.id != "597378876556967936") return; // jMS Gamers Club

    if (msg.channel.id != "623153228267388958") return; // #vc

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
            bot.leaveVoiceChannel(connection.id)
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
    if (addSpeakMsg(msg.content) == false) {
        msg.addReaction("❌");
    }
});

// TODO: なんかいろいろ https://github.com/pekko1215/DiscordTalker/blob/master/server.js

function addSpeakMsg(content) {
    content = replaceSpeakMessage(content);
    if (content.length == 0) {
        return false;
    }
    if (!connection) {
        return;
    }
    if (connection.playing) {
        textBuffer.push({
            voice: getSpeaker(content),
            msg: content
        });
    } else {
        var error = getSpeakStream({
            voice: getSpeaker(content),
            msg: content
        })
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

function replaceSpeakMessage(content) {
    var ranges = [
        "\ud83c[\udf00-\udfff]",
        "\ud83d[\udc00-\ude4f]",
        "\ud83d[\ude80-\udeff]",
        "\ud7c9[\ude00-\udeff]",
        "[\u2600-\u27BF]"
    ];
    var ex = new RegExp(ranges.join("|"), "g");
    content = content.replace(ex, ""); //ここで削除
    content = content.replace(new RegExp("speaker:[A-Za-z0-9]+", "g"), "");

    return content;
}

// speaker:とか消す
function getSpeakStream(obj) {
    if (obj.voice == undefined) obj.voice = "hikari";
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
}

function joinVC(channelID) {
    bot
        .joinVoiceChannel(channelID)
        .then((con) => {
            connection = con;
            connection.on("end", () => {
                if (textBuffer.length) {
                    connection.play(getSpeakStream(textBuffer.shift()))
                }
            })
        });
}

bot.connect();