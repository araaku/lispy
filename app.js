var inbox = require("inbox");
var util = require("util");
var http = require('http');
var fs = require('fs');
var play = require('play');
var exec = require('child_process').exec;

var api = "http://translate.google.com/translate_tts?tl=en"; // path of the API to convert Text to Speach
var targetFrom = ""; // leave empty if you want the app to read all messages
var messageThreshold = -1; //Number of recent messages to be read from INBOX. Negative sigh means Most Recent.
var cmd = 'vlc --qt-start-minimized #file# vlc://quit'; // command to play the mp3 file. #file# will be replaced with actual file name


var DELETE_WHEN_PROCESSED = false; // Delete the message from inbox once processed.

// Set it to true if you want the program to process emails received when the programs was not running.
// If set to false, it will wait for the new email(s) to arrive and process them.
var PROCESS_OLD_EMAILS_ON_START = false;

/// Types of emails. Will be used as ENUM
var MessageType = {
    BDAY: "bday",
    ONBOARD: "onboard",
    YEARCOMPLETION: "yearcompletion",
    ANNOUNCEMENT: "announcement",
    UNSURE: "unsure"
};

var MediaFiles = {
    BDAY: "bday.mp3",
    YEARCOMPLETION: "canon.mp3",
    ONBOARD: "welcomeaboard.mp3"
};

/// Base object to hold all required properties of an email
function lispyMessage() {
    this.MessageType = MessageType.UNSURE; // default
    this.from = "";
    this.UID = "";
    this.subject = "";
    this.body = "";
    this.subjectAudioFileName = "";
}


var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth: {
        user: "<your email address>",
        pass: "<password>"
    },
    debug: false
});

client.connect();

console.log("Connecting to server...");

client.on("connect", function() {
    console.log("Connected.");


    client.openMailbox("INBOX", {
        readOnly: false
    }, function(error, mailbox) {
        if (error) throw error;

        if(PROCESS_OLD_EMAILS_ON_START){
            /// Read old messages from INBOX
            client.listMessages(messageThreshold, function(error, messages) {
                messages.forEach(function(message) {
                    ProcessMessage(message);
                })
            });
        }

    });


    // Events to process new messages received while the program is in Running condition.
    client.on("new", function(message) {
        ProcessMessage(message);
    });

});

client.on('error', function(err) {
    console.log('Error');
    console.log(err)
});

client.on('close', function() {
    console.log('DISCONNECTED!');
});

/// Fetches all required properties from the email message object passed as input argument
function ProcessMessage(message) {
    console.log("New Message Received");

    var lMessage = new lispyMessage();
    lMessage.from = message.from.address;
    lMessage.UID = message.UID;
    lMessage.subject = message.title.toLowerCase();
    lMessage.subjectAudioFileName = lMessage.UID + ".mp3";

    if (!ValidateMessage(lMessage)) {
        console.log("No juice. Move on!");
        return;
    }

    /// Read message body stream
    var readStream = client.createMessageStream(lMessage.UID);

    readStream
        .on('data', function(chunk) {
            /// Email body will be received in chunks.
            /// Keep appending the chunks into the body object of lispyMessage.
            lMessage.body += chunk;
        })
        .on('end', function() {
            /// All chunks received. Proceed to process further.
            ProcessMessageDetails(lMessage);

            if(DELETE_WHEN_PROCESSED){
                client.deleteMessage(lMessage.UID, function(error){
                        console.log("Message Deleted!");
                });
            }

            console.log("END readable");
        });
}

/// Process messages only from a particular user.
/// TBD: Handle it at the time of fetching emails in OpenMailbox function.
function ValidateMessage(lMessage) {
    console.log("Validating message " + lMessage.from + " " + lMessage.subject);

    if (targetFrom.trim() != "" && lMessage.from.toLowerCase() == targetFrom.toLowerCase()) {
        return true;
    }else if(targetFrom.trim() == ""){
        return true; // ignore sender if the value is not set.
    }

    return false;
}

/// Identify the type of the message and take action accordingly.
function ProcessMessageDetails(lMessage) {
    console.log("Processing Message body");
    IndetifyMessage(lMessage);

    if(lMessage.MessageType == MessageType.UNSURE){
        console.log("MessageType is Unsure. Quitting.");
        return;
    }

    SubjectToAudio(lMessage);

}

function SubjectToAudio(lMessage){

    var subject = lMessage.subject.replace(/\//g, " "); /// remove forward slashes from subject

    api = api + "&q=" + subject;

    DownloadFromURL(api, lMessage.subjectAudioFileName , function(){
        console.log("Flie Downloaded and closed.");

		// Playback the Subject line
        PlayAudioFile(lMessage.subjectAudioFileName, true, function(fileToPlay){

			/// Play occasion tune
            switch (lMessage.MessageType){
			        case MessageType.BDAY:
			            PlayAudioFile(MediaFiles.BDAY, false);
			            break;
			        case MessageType.YEARCOMPLETION:

                        var yearCount = ExtractYearFromMessage(lMessage.body);

                        if(yearCount <= 1){
                            PlayAudioFile(MediaFiles.YEARCOMPLETION, false);
                        }else{
                            var command = "";
                            for(var i=0; i< yearCount; i++){
                                // build a playlist by concatenating same file name up to the year count
                                command += MediaFiles.YEARCOMPLETION + " ";
                            }

                            PlayAudioFile(command, false);
                        }
			            break;
			        case MessageType.ONBOARD:
			        	PlayAudioFile(MediaFiles.ONBOARD, false);
			            break;
			        default:
			            console.log("Unknown message type. Quitting.");
			            break;
    		};
        });
    });
}

function ExtractYearFromMessage(msgBody){

    /// sample msgbody value: "manymanycongratulationsoncompleting6thsuccessfulyear"

    var year = 1; // At least one canon should be fired even if we are not able to extract the year :)

    var text = msgBody.toLowerCase().replace(/\W/g, ""); // replace everything but alphanumeric characters

    var startHint = "oncompleting";
    var endHint = "thsuccessful";

    var start = text.indexOf(startHint) + startHint.length;
    var end = text.indexOf(endHint);

    if(isNaN(start) || isNaN(end)){
        return year; // default value
    }

    var length = end - start;

    if(isNaN(length)){
        return year; // default value
    }

    year = text.substr(start, length);

    if(isNaN(year)){
        return 1; // default value
    }
    
    return parseInt(year, 10);
    
}

function DownloadFromURL(url, dest, cb) {

  var file = fs.createWriteStream(dest);

  var request = http.get(url, function(response) {
  
    response.pipe(file);
  
    file.on('finish', function() {
      file.close(cb);
  
    });
  
  });
};

function PlayAudioFile(fileToPlay, deleteOncePlayed, callback){

    var command = cmd.replace("#file#", fileToPlay);

    console.log("Playing file: " + fileToPlay + " with command: " + command);
    exec(command, function(error, stdout, stderr) {

        console.log("PLAYED.");

        if(deleteOncePlayed){
            fs.unlinkSync(fileToPlay);
            console.log("File Deleted");
        }

        if(typeof callback === "function"){
            callback(fileToPlay);
        }
    });
}


/// Indetify the type of message based on the email subject
function IndetifyMessage(lMessage) {
	if(lMessage.subject.indexOf("birthday wishes") > -1
		|| lMessage.subject.indexOf("happy returns") > -1){
			lMessage.MessageType = MessageType.BDAY;
	}

	else if(lMessage.subject.indexOf("welcome onboard") > -1
        || lMessage.subject.indexOf("welcome aboard") > -1){
			lMessage.MessageType = MessageType.ONBOARD;
	}

	else if(lMessage.subject.indexOf("laitkor anniversary wishes") > -1
		|| lMessage.subject.indexOf("laitkor anniversary") > -1){
				lMessage.MessageType = MessageType.YEARCOMPLETION;
	}
}
