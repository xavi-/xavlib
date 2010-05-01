(function(window, undefined) {
    function xhr() { 
        return window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest(); 
    }
    
    function Channel(id, initInfo) {
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
                    
                    if(client.status !== 200) { setTimeout(listen, 0); return; }
                    
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
        
        this.userId = function() { return document.cookie; };
        
        this.onReceive = function onReceive(l) { onreceive.push(l); };
        
        this.start = function start() { listen(); };
        
        this.send = (function() { 
            var queue = [], inflight = false, client = xhr();
            var url = [ "/channel/", id, "/send" ].join("");
            
            function _send(msg) {
                client.open("POST", url);
                client.onreadystatechange = function() {
                    if(client.readyState !== 4) { return; }
                    
                    var infoId = parseInt(client.responseText, 10) || 0;
                    
                    if(infoId > lastInfoId) { lastInfoId = infoId; }
                    
                    if(queue.length > 0) { setTimeout(function() { _send(queue.shift()); }, 0); }
                    else { inflight = false; }
                };
                client.send(msg);
                
                inflight = true;
            }
            
            return function send(msg) {
                if(inflight) { queue.push(JSON.stringify(msg)); }
                else { _send(JSON.stringify(msg)); }
            };
        })();
    };
    
    Channel.prototype.clear = function clear() {
        this.send({ clear: "true" });
    };
    
    window.Channel = Channel;
})(window);