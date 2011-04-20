// /channel/<session-id>/send?msg=<json> => returns an info-id
// /channel/<session-id>/read?info-id=<int-id> => returns a list of json messages
(function(context) {
    var url = require("url");
    var events = require("events");

    var cookie = { parse: function(data) {
        var parsed = {};
        (data || "").replace(/(\S*)=(\S*)(;\s*|$)/g, function(_, key, val) { parsed[key] = val; return _; });
        return parsed;
    } };
    
    var Channel = (function() {
        var nextInfoId = (function() {
            var infoId = 1;
            return function nextInfoId() { return infoId++; };
        })();
        
        function sendJSON(userId, content, res) {
            var body = JSON.stringify(content);
            res.writeHead(200, { "Content-Length": body.length,
                                 "Content-Type": "application/json",
                                 "Cache-Control": "no-cache",
                                 "Set-Cookie": "user-id=" + userId  + "; path=/;"});
            res.end(body);
        }
        
        return function Channel(id) {
            var users = {}, responses = [], ch = this;
            
            function statusChange(userId) {
                if(users[userId] == null) { _events.emit("change", { userId: userId, event: "join" }); }
            }
            
            function removeUser(userId) {
                delete users[userId];
                _events.emit("change", { userId: userId, event: "leave" });
            }

            this.id = id;
            
            this.data = [];
            
            this.lastInfoId = 0;
            
            var _events = new events.EventEmitter();
            this.onUserChange = function(listener) { _events.on("change", listener); };

            this.users = function() {
                return Object.keys(users).map(function(k) { return { userId: k, idle: users[k] }; }); 
            };
            
            this.onReceive = function(listener) { _events.on("receive", listener); };
            
            this.info = function info(userId, type, res) {
                var content = { type: type };
                
                if(type === "users") { content.message = users; }
                else if(type === "remove-me") {
                    content.message = (users[userId] ? "OK" : "NA");
                    responses = responses.filter(function(o) { return o.userId !== userId; });
                    removeUser(userId);
                }
                else { content.message = "Unknown Type"; }
                
                sendJSON(userId, content, res);
            };
            
            this.send = function send(userId, content) {
                var info = [], lastInfoId;
                function sendMore(userId, content) {
                    lastInfoId = nextInfoId();
                    info.push({ infoId: lastInfoId, message: { userId: userId, content: content } });
                    return lastInfoId;
                }
                
                sendMore(userId, content);
                
                _events.emit("recieve", info[0].message, sendMore);
                
                if(!info[0].message.content) { return -1; }
                
                Array.prototype.push.apply(this.data, info);
                
                responses.filter(function(o) { return o.userId !== userId; })
                         .forEach(function(o) { sendJSON(o.userId, info, o.response); });
                responses = responses.filter(function(o) { return o.userId === userId; });
                
                var newInfo = info.filter(function(o) { return o.message.userId !== userId; });
                if(newInfo.length > 0) {
                    responses.forEach(function(o) { sendJSON(o.userId, newInfo, o.response); });
                    responses = [];
                }
                
                this.lastInfoId = lastInfoId
                return lastInfoId;
            };
            
            this.read = function read(userId, infoId, res) {
                var content = this.data.filter(function(item) { return item.infoId > infoId; });
                
                if(content.length === 0) {
                    responses = responses.filter(function(o) { return o.userId !== userId; });
                    responses.push({ userId: userId, response: res, time: (new Date()).getTime() });
                } else { sendJSON(userId, content, res); }
                
                statusChange(userId);
                users[userId] = 0;
            };
            
            this.destroy = function destroy() {
                responses // Removing old responses
                    .forEach(function(o) { sendJSON(o.userId, [], o.response); o.response = null; });
                
                delete channels[this.id]
            };
            
            setInterval(function() { // Reset connections and reap users
                var curTime = (new Date()).getTime();
                responses // Removing old responses
                    .filter(function(o) { return curTime - o.time > 45000; }) // After 45secs close connection
                    .forEach(function(o) { sendJSON(o.userId, [], o.response); o.response = null; });
                responses = responses.filter(function(o) { return o.response != null });
                
                for(var userId in users) { users[userId] += 1; }
                responses.forEach(function(o) { users[o.userId] = 0; });
                for(var userId in users) if(users[userId] > 2) { removeUser(userId); }
            }, 5000);
            
            createEvent.emit("create", id, this);
        };
    })();
    
    var channels = {};
    
    function init(line) {
        var nextUserId = (function() {
            var userId = (new Date()).getTime();
            return function nextUserId() { return (userId++).toString(); };
        })();
        
        line.add({
            "r`^/channel/([a-zA-Z0-9_-]+)/info$`": function(req, res, match) { // Info
                var uri = url.parse(req.url, true);
                var channelId = match
                
                channels[channelId] = channels[channelId] || (new Channel(channelId));
                
                var userId = cookie.parse(req.headers["cookie"])["user-id"] || nextUserId();
                var type = uri.query["type"];
                
                channels[channelId].info(userId, type, res);
            },
            "r`^/channel/([a-zA-Z0-9_-]+)/send$`": function(req, res, match) { // Send
                var channelId = match[0];
                
                channels[channelId] = channels[channelId] || (new Channel(channelId));
                
                var userId = cookie.parse(req.headers["cookie"])["user-id"] || nextUserId();
                
                // Reading POST data
                var data = ""
                req.addListener("data", function(chunk) { data += chunk; });
                req.addListener("end", function() {
                    var messages = JSON.parse(data);
                    var channel = channels[channelId];
                    
                    var infoIds = JSON.stringify(messages.map(function(msg) { return channel.send(userId, msg); }));
                    
                    // reply new info to listeners
                    res.writeHead(200, { "Content-Length": infoIds.length,
                                         "Content-Type": "text/plain",
                                         "Cache-Control": "no-cache",
                                         "Set-Cookie": "user-id=" + userId + "; path=/;"});
                    res.end(infoIds);
                });
            },
            "r`^/channel/([a-zA-Z0-9_-]+)/read$`": function(req, res, match) {
                var uri = url.parse(req.url, true);
                var channelId = match[0];
                
                channels[channelId] = channels[channelId] || (new Channel(channelId));
                
                var userId = cookie.parse(req.headers["cookie"])["user-id"];
                var infoId = parseInt(uri.query["info-id"], 10) || 0;
                
                if(!userId) { // set user-id if user doesn't have one
                    userId = nextUserId();
                    
                    var body = infoId.toString();
                    res.writeHead(200, { "Content-Length": body.length,
                                         "Content-Type": "application/json",
                                         "Cache-Control": "no-cache",
                                         "Set-Cookie": "user-id=" + userId  + "; path=/;"});
                    res.end(body);
                    console.log("New user id generated: userid: " + userId);
                    return;
                }
                
                channels[channelId].read(userId, infoId, res);
                
                console.log(req.headers["cookie"]);
            }
        });
    }
    
    function create(id) {
        channels[id] = channels[id] || (new Channel(id));
        return channels[id];
    }
    
    var createEvent = new events.EventEmitter();
    context.init = init;
    context.channels = channels;
    context.create = create;
    context.onCreate = function(listener) { createEvent.on("create", listener); };
})(exports);