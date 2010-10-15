(function(window, undefined) {
    var BACKOFF_RATE = 2;
    
    function noop() { }
    
    function xhr() { 
        return window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest(); 
    }
    
    function Channel(id, initInfo) {
        var resetTime = 1;
        var onreceive = [], lastInfoId = initInfo || 0, stopped = false;;
        
        var listen = (function() {
            var client = xhr(), baseUrl = "/channel/" + id + "/read?info-id=";
            
            window.onbeforeunload = function() {
                stopped = true;
                client.abort();
                client.open("POST", "/channel/" + id + "/info?type=remove-me");
                client.send();
            };
            
            return function() {
                if(stopped) { return; }
                
                client.open("GET", baseUrl + lastInfoId);
                client.onreadystatechange = function() {
                    if(client.readyState !== 4) { return; }
                    
                    if(client.status === 200) { resetTime = 1; }
                    else {
                        setTimeout(listen, resetTime);
                        resetTime *= BACKOFF_RATE;
                        return;
                    }
                    
                    if(client.responseText) {
                        var info = JSON.parse(client.responseText);
                        
                        for(var i = 0; i < info.length; i++) {
                            for(var j = 0; j <  onreceive.length; j++) { onreceive[j](info[i].message); }
                            
                            if(info[i].infoId > lastInfoId) { lastInfoId = info[i].infoId; }
                        }
                    }
                    
                    setTimeout(listen, 0);
                };
                client.send();
            };
        })();
        
        this.id = function() { return id; };
        
        this.userId = function() { return document.cookie.match(/user-id=([0-9]+)(;|$)/)[1] };
        
        this.onReceive = function onReceive(l) { onreceive.push(l); };
        
        this.start = function start() { listen(); };
        
        this.send = (function() { 
            var queue = [], callbacks = [];
            var inflight = false, client = xhr();
            var url = [ "/channel/", id, "/send" ].join("");
            
            function _send(errs) {
                client.open("POST", url);
                client.onreadystatechange = function() {
                    if(client.readyState !== 4) { return; }
                    
                    var infoIds = JSON.parse(client.responseText) || [];
                    
                    for(var i = 0; i < infoIds.length; i++) {
                        if(infoIds[i] === -1) { errs[i](); }
                        else if(infoIds[i] > lastInfoId) { lastInfoId = infoIds[i]; }
                    }
                    
                    if(queue.length === 0) { inflight = false; }
                    else { setTimeout(function() { _send(callbacks); }, 0); }
                };
                client.send(JSON.stringify(queue));
                queue = [];
                
                inflight = true;
            }
            
            return function send(msg, err) {
                queue.push(msg);
                callbacks.push(err || noop);
                
                if(!inflight) { _send(callbacks); }
            };
        })();
    };
    
    Channel.prototype.clear = function clear() {
        this.send({ clear: "true" });
    };
    
    window.Channel = Channel;
})(window);